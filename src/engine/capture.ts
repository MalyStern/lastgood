// Capture a Fingerprint: a small, local-only snapshot of facts about the project
// right now. Everything here is cheap and read-only. It NEVER reads secret values —
// only env-var key names — and never touches a database (migrations are counted on
// disk). The DB, if reachable, is a bonus other tiers can add later.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { EnvSchema, Fingerprint, MigrationSnapshot, ResolvedConfig, Runtime } from '../core/types.js'
import { SCHEMA_VERSION } from '../core/types.js'
import { probeRuntime } from './probes.js'

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')
const read = (p: string): string | null => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}
const readBin = (p: string): Buffer | null => {
  try {
    return readFileSync(p)
  } catch {
    return null
  }
}
const has = (root: string, f: string): boolean => existsSync(join(root, f))

const LOCKFILES = [
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'npm-shrinkwrap.json',
  'requirements.txt', 'poetry.lock', 'uv.lock', 'Pipfile.lock',
  'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock', 'gradle.lockfile',
]

const ENV_EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist']

/** Which runtimes to probe, based on which ecosystem markers exist. */
export function runtimesPresent(root: string): Runtime[] {
  const out: Runtime[] = []
  if (has(root, 'package.json')) out.push('node')
  if (has(root, 'pyproject.toml') || has(root, 'requirements.txt') || has(root, 'Pipfile')) out.push('python')
  if (has(root, 'go.mod')) out.push('go')
  if (has(root, 'Gemfile')) out.push('ruby')
  if (has(root, 'pom.xml') || has(root, 'build.gradle') || has(root, 'build.gradle.kts')) out.push('java')
  if (has(root, 'global.json') || readdirSafe(root).some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) out.push('dotnet')
  return out
}

function readdirSafe(p: string): string[] {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

/** env-var KEY names (never values) from a dotenv-style file. */
export function parseEnvKeys(content: string): string[] {
  const keys: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (m) keys.push(m[1]!)
  }
  return keys
}

function captureGit(root: string): Fingerprint['git'] {
  const run = (args: string[]): string | null => {
    try {
      return String(execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim()
    } catch {
      return null
    }
  }
  const commit = run(['rev-parse', 'HEAD'])
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD'])
  const porcelain = run(['status', '--porcelain'])
  const changed = porcelain ? porcelain.split(/\r?\n/).filter((l) => l.trim()).length : 0
  return { commit, branch, dirty: changed > 0, changedCount: changed }
}

function captureLockfiles(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const lf of LOCKFILES) {
    const b = readBin(join(root, lf))
    if (b) out[lf] = sha256(b)
  }
  return out
}

function captureEnvSchema(root: string): EnvSchema {
  const sources: string[] = []
  const keys = new Set<string>()
  for (const name of ENV_EXAMPLES) {
    const c = read(join(root, name))
    if (c) {
      sources.push(name)
      for (const k of parseEnvKeys(c)) keys.add(k)
    }
  }
  const sorted = [...keys].sort()
  return { keys: sorted, keysHash: sha256(sorted.join('\n')), sources }
}

function captureDockerServices(root: string): string[] {
  const composeName = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => has(root, f))
  if (!composeName) return []
  const c = read(join(root, composeName))
  if (!c) return []
  try {
    const doc = parseYaml(c) as { services?: Record<string, unknown> }
    return doc?.services ? Object.keys(doc.services).sort() : []
  } catch {
    return []
  }
}

/** Is this env key actually a port key? PORT must be a whole underscore-token,
 * so SUPPORT / PASSPORT / EXPORT / TRANSPORT never match. */
const isPortKey = (key: string): boolean => key.toUpperCase().split('_').includes('PORT')

/**
 * Host ports the project declares. Read ONLY from compose mappings and EXAMPLE env
 * files — never the real .env. Example files hold placeholder values, not secrets;
 * the real .env is never opened here, keeping the "values are never read" promise.
 */
export function capturePorts(root: string): number[] {
  const ports = new Set<number>()
  const composeName = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => has(root, f))
  if (composeName) {
    const c = read(join(root, composeName)) ?? ''
    for (const m of c.matchAll(/["'\s-](\d{2,5}):\d{2,5}["'\s]/g)) ports.add(Number(m[1]))
  }
  for (const name of ENV_EXAMPLES) {
    const e = read(join(root, name))
    if (!e) continue
    for (const line of e.split(/\r?\n/)) {
      const m = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?(\d{1,5})\b/)
      if (m && isPortKey(m[1]!)) ports.add(Number(m[2]))
    }
  }
  return [...ports].filter((p) => p > 0 && p < 65536).sort((a, b) => a - b)
}

// A migration set is a fact we count on disk — never a DB query. The snapshot is
// count + a hash of the sorted filenames, so `diff` can tell "one was added" from
// "one was renamed" (same count, different hash) without ever connecting anywhere.
// Detection mirrors what each ecosystem actually ships:
//   prisma  — folders under prisma/migrations/
//   drizzle — .sql files under drizzle/
//   rails   — .rb files under db/migrate/
//   alembic — revision .py files under the versions/ dir
//   flyway  — V/U/R__*.sql files under the conventional migration dir
//   django  — .py migrations across every app's migrations/ package
export function captureMigrations(root: string, tools: string[]): Record<string, MigrationSnapshot> {
  const out: Record<string, MigrationSnapshot> = {}

  if (tools.includes('prisma')) {
    const dir = join(root, 'prisma', 'migrations')
    if (existsSync(dir)) out.prisma = snap(readdirSafe(dir).filter((e) => isDirAt(join(dir, e))))
  }

  if (tools.includes('drizzle')) {
    const dir = join(root, 'drizzle')
    if (existsSync(dir)) out.drizzle = snap(readdirSafe(dir).filter((e) => e.endsWith('.sql')))
  }

  if (tools.includes('rails')) {
    const dir = join(root, 'db', 'migrate')
    if (existsSync(dir)) out.rails = snap(readdirSafe(dir).filter((e) => e.endsWith('.rb')))
  }

  if (tools.includes('alembic')) {
    const versions = findAlembicVersionsDir(root)
    if (versions) out.alembic = snap(readdirSafe(versions).filter(isRevisionPy))
  }

  if (tools.includes('flyway')) {
    const dir = findFlywayDir(root)
    if (dir) out.flyway = snap(readdirSafe(dir).filter((e) => FLYWAY_SQL.test(e)))
  }

  if (tools.includes('django')) {
    const dirs = findDjangoMigrationDirs(root)
    if (dirs.length > 0) {
      // Qualify each filename with its app dir: two apps can both ship 0001_initial.py,
      // and the hash must treat them as distinct entries.
      const names: string[] = []
      for (const d of dirs) {
        for (const e of readdirSafe(d.abs).filter(isRevisionPy)) names.push(`${d.rel}/${e}`)
      }
      out.django = snap(names)
    }
  }

  return out
}

const isDirAt = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** A revision file, not the package marker Python migration dirs carry. */
const isRevisionPy = (name: string): boolean => name.endsWith('.py') && name !== '__init__.py'

// Flyway's default naming: versioned V<version>__desc.sql, undo U<version>__desc.sql,
// repeatable R__desc.sql. Distinctive enough that a stray .sql file isn't counted.
const FLYWAY_SQL = /^(?:[VU][^_]+|R)__.+\.sql$/

// Alembic's script_location is configurable in alembic.ini; revisions always live in
// a versions/ child of it. Honour the ini (an INI string, never imported/executed),
// then fall back to the conventional layouts.
function findAlembicVersionsDir(root: string): string | null {
  const rels: string[] = []
  const ini = join(root, 'alembic.ini')
  if (existsSync(ini)) {
    const text = read(ini)
    const line = text
      ?.split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^script_location\s*=/.test(l))
    const loc = line?.split('=')[1]?.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (loc) rels.push(`${loc}/versions`)
  }
  for (const d of ['alembic', 'migrations', 'db/migrations', 'db', 'migration', 'src/migrations']) {
    rels.push(`${d}/versions`)
  }
  for (const rel of [...new Set(rels)]) {
    const abs = join(root, ...rel.split('/'))
    if (existsSync(abs) && isDirAt(abs)) return abs
  }
  return null
}

// Flyway has no single canonical dir; take the first conventional one that actually
// holds Flyway-named SQL, so a random sql/ folder of ad-hoc scripts isn't counted.
function findFlywayDir(root: string): string | null {
  const candidates = [
    'src/main/resources/db/migration',
    'src/main/resources/db/migrations',
    'db/migration',
    'db/migrations',
    'database/migrations',
    'migrations',
    'sql',
  ]
  for (const rel of candidates) {
    const abs = join(root, ...rel.split('/'))
    if (existsSync(abs) && isDirAt(abs) && readdirSafe(abs).some((e) => FLYWAY_SQL.test(e))) return abs
  }
  return null
}

// Django keeps migrations per app in a migrations/ package (carrying __init__.py —
// what distinguishes it from an Alembic/Flyway `migrations` folder). Only look when
// manage.py marks a Django project, and bound the walk: skip virtualenvs / vendored
// trees (whose installed packages carry their OWN migrations) and never follow
// symlinks, so this stays cheap and loop-free.
const WALK_SKIP = new Set([
  'node_modules', '.git', '.venv', 'venv', 'env', '__pycache__', 'site-packages',
  '.tox', 'dist', 'build', '.mypy_cache', '.pytest_cache', '.idea', '.vscode',
])

function findDjangoMigrationDirs(root: string): { abs: string; rel: string }[] {
  if (!existsSync(join(root, 'manage.py'))) return []
  const out: { abs: string; rel: string }[] = []
  const walk = (absDir: string, relDir: string, depth: number): void => {
    if (depth > 6) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      // isDirectory() is false for a symlink Dirent (readdir doesn't follow) — so this
      // also excludes symlinked dirs, ruling out cycles.
      if (!e.isDirectory()) continue
      if (WALK_SKIP.has(e.name) || e.name.startsWith('.')) continue
      const childAbs = join(absDir, e.name)
      const childRel = relDir ? `${relDir}/${e.name}` : e.name
      if (e.name === 'migrations' && existsSync(join(childAbs, '__init__.py'))) {
        out.push({ abs: childAbs, rel: childRel })
        continue // a migrations package doesn't nest another
      }
      walk(childAbs, childRel, depth + 1)
    }
  }
  walk(root, '', 0)
  // Stable order so the qualified-name hash is deterministic across runs.
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

const snap = (names: string[]): MigrationSnapshot => {
  const sorted = [...names].sort()
  return { files: sorted.length, filesHash: sha256(sorted.join('\n')) }
}

function captureFileHashes(root: string, config: ResolvedConfig): Record<string, string> {
  const out: Record<string, string> = {}
  const candidates = [...config.schemaFiles, ...config.watchPaths]
  for (const rel of candidates) {
    const b = readBin(join(root, rel))
    if (b) out[rel] = sha256(b)
  }
  return out
}

export interface CaptureOptions {
  trigger: Fingerprint['trigger']
  success?: Fingerprint['success']
  note?: string
}

export async function captureFingerprint(
  root: string,
  config: ResolvedConfig,
  opts: CaptureOptions,
  signal?: AbortSignal,
): Promise<Fingerprint> {
  const enabled = (id: string): boolean => config.detectors[id] !== false

  const runtimes: Fingerprint['runtimes'] = {}
  if (enabled('runtimes')) {
    for (const rt of runtimesPresent(root)) {
      const probe = await probeRuntime(rt, signal)
      runtimes[rt] = probe.version
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: 'lastgood',
    createdAt: new Date().toISOString(),
    trigger: opts.trigger,
    machine: { os: process.platform, arch: process.arch },
    git: enabled('git') ? captureGit(root) : { commit: null, branch: null, dirty: false, changedCount: 0 },
    lockfiles: enabled('lockfiles') ? captureLockfiles(root) : {},
    runtimes,
    envSchema: enabled('env_schema') ? captureEnvSchema(root) : { keys: [], keysHash: '', sources: [] },
    dockerServices: enabled('docker') ? captureDockerServices(root) : [],
    ports: enabled('ports') ? capturePorts(root) : [],
    migrations: enabled('migrations') ? captureMigrations(root, config.migrationTools) : {},
    fileHashes: enabled('schema') ? captureFileHashes(root, config) : {},
    success: opts.success,
    note: opts.note,
  }
}

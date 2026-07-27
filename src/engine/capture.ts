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

/** Host ports declared in compose port mappings + *PORT env keys. */
export function capturePorts(root: string): number[] {
  const ports = new Set<number>()
  const composeName = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => has(root, f))
  if (composeName) {
    const c = read(join(root, composeName)) ?? ''
    for (const m of c.matchAll(/["'\s-](\d{2,5}):\d{2,5}["'\s]/g)) ports.add(Number(m[1]))
  }
  for (const name of [...ENV_EXAMPLES, '.env']) {
    const e = read(join(root, name)) ?? ''
    for (const m of e.matchAll(/^(?:export\s+)?[A-Z0-9_]*PORT[A-Z0-9_]*\s*=\s*["']?(\d{2,5})/gm)) ports.add(Number(m[1]))
  }
  return [...ports].filter((p) => p > 0 && p < 65536).sort((a, b) => a - b)
}

function captureMigrations(root: string, tools: string[]): Record<string, MigrationSnapshot> {
  const out: Record<string, MigrationSnapshot> = {}
  if (tools.includes('prisma')) {
    const dir = join(root, 'prisma', 'migrations')
    const entries = readdirSafe(dir).filter((e) => {
      try {
        return statSync(join(dir, e)).isDirectory()
      } catch {
        return false
      }
    })
    if (existsSync(dir)) out.prisma = snap(entries)
  }
  if (tools.includes('drizzle')) {
    const dir = join(root, 'drizzle')
    const sql = readdirSafe(dir).filter((e) => e.endsWith('.sql'))
    if (existsSync(dir)) out.drizzle = snap(sql)
  }
  return out
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

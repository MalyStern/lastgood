// Full user control lives here. Config comes from lastgood.yml (the format in the
// docs), lastgood.config.json, or a "lastgood" key in package.json. Everything is
// optional. Two privacy guarantees are HARD — not toggles: env values are never
// read, and nothing is ever sent over a network. We accept the config keys for them
// only so a reassured user sees them respected; setting them true does nothing.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ResolvedConfig, Severity } from './types.js'

export const DEFAULT_CONFIG: ResolvedConfig = {
  successCommand: undefined,
  runOnSuccess: true,
  privacy: { storeEnvValues: false, cloudSync: false },
  detectors: {},
  watchPaths: [],
  ignore: [],
  failOn: 'blocking',
  migrationTools: ['prisma', 'drizzle'],
  schemaFiles: ['prisma/schema.prisma', 'src/db/schema.ts', 'drizzle/schema.ts'],
}

type Raw = Record<string, unknown>

/** Normalise the documented (snake_case, nested {enabled}) shape into ResolvedConfig fields. */
export function normalizeConfig(raw: Raw): Partial<ResolvedConfig> {
  const out: Partial<ResolvedConfig> = {}
  const get = (a: string, b: string): unknown => raw[a] ?? raw[b]

  const success = get('success_command', 'successCommand')
  if (typeof success === 'string') out.successCommand = success

  const ros = get('run_on_success', 'runOnSuccess')
  if (typeof ros === 'boolean') out.runOnSuccess = ros

  const wp = get('watch_paths', 'watchPaths')
  if (Array.isArray(wp)) out.watchPaths = wp.filter((x): x is string => typeof x === 'string')

  if (Array.isArray(raw.ignore)) out.ignore = raw.ignore.filter((x): x is string => typeof x === 'string')

  const diff = raw.diff as Raw | undefined
  const failOn = (diff?.fail_on ?? raw.failOn ?? raw.fail_on) as string | undefined
  if (failOn && ['blocking', 'likely', 'nice'].includes(failOn)) out.failOn = failOn as Exclude<Severity, 'info'>

  const detectors = raw.detectors as Record<string, unknown> | undefined
  if (detectors && typeof detectors === 'object') {
    const map: Record<string, boolean> = {}
    for (const [name, val] of Object.entries(detectors)) {
      if (typeof val === 'boolean') map[name] = val
      else if (val && typeof val === 'object' && 'enabled' in val) map[name] = (val as { enabled?: boolean }).enabled !== false
      // pull nested detail: runtimes.probe, migrations.tools, schema.hash
      if (name === 'migrations' && val && typeof val === 'object' && Array.isArray((val as Raw).tools)) {
        out.migrationTools = ((val as Raw).tools as unknown[]).filter((x): x is string => typeof x === 'string')
      }
      if (name === 'schema' && val && typeof val === 'object' && Array.isArray((val as Raw).hash)) {
        out.schemaFiles = ((val as Raw).hash as unknown[]).filter((x): x is string => typeof x === 'string')
      }
    }
    out.detectors = map
  }

  return out
}

export function loadConfig(root: string, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  let user: Partial<ResolvedConfig> = {}

  const yml = ['lastgood.yml', 'lastgood.yaml'].map((n) => join(root, n)).find((p) => existsSync(p))
  if (yml) {
    try {
      const parsed = parseYaml(readFileSync(yml, 'utf8')) as Raw
      if (parsed && typeof parsed === 'object') user = normalizeConfig(parsed)
    } catch {
      /* ignore malformed yaml */
    }
  }
  const jsonPath = join(root, 'lastgood.config.json')
  if (existsSync(jsonPath)) {
    try {
      user = { ...user, ...normalizeConfig(JSON.parse(readFileSync(jsonPath, 'utf8'))) }
    } catch {
      /* ignore */
    }
  }
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg?.lastgood) user = { ...normalizeConfig(pkg.lastgood), ...user }
    } catch {
      /* ignore */
    }
  }

  return merge(merge(DEFAULT_CONFIG, user), overrides)
}

function merge(base: ResolvedConfig, over: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    successCommand: over.successCommand ?? base.successCommand,
    runOnSuccess: over.runOnSuccess ?? base.runOnSuccess,
    privacy: { storeEnvValues: false, cloudSync: false }, // hard — never overridable
    detectors: { ...base.detectors, ...(over.detectors ?? {}) },
    watchPaths: over.watchPaths ?? base.watchPaths,
    ignore: over.ignore ?? base.ignore,
    failOn: over.failOn ?? base.failOn,
    migrationTools: over.migrationTools ?? base.migrationTools,
    schemaFiles: over.schemaFiles ?? base.schemaFiles,
  }
}

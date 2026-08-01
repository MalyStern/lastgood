// Full user control lives here. Config comes from lastgood.yml (the format in the
// docs), lastgood.config.json, or a "lastgood" key in package.json. Everything is
// optional. Two privacy guarantees are HARD — not toggles: env values are never
// read, and nothing is ever sent over a network. We accept the config keys for them
// only so a reassured user sees them respected; setting them true does nothing.

import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { DETECTOR_IDS } from './types.js'
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

/** A problem with the user's config file — distinct from a problem with their
 * project, so the CLI can say plainly which one it is. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/** Notepad and PowerShell's `Set-Content -Encoding utf8` prepend a UTF-8 BOM,
 * which JSON.parse rejects — on Windows that is how people edit these files. */
const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

/** Top-level keys the config understands, in both documented spellings. Anything
 * else is almost certainly a typo — and a typo that is silently dropped means the
 * setting you wrote never happened, with nothing on screen to tell you. */
const KNOWN_KEYS = new Set([
  'success_command', 'successCommand',
  'run_on_success', 'runOnSuccess',
  'watch_paths', 'watchPaths',
  'ignore', 'detectors', 'diff', 'failOn', 'fail_on', 'privacy',
  // Written by `lastgood init` and reserved for a future format change. Accepted
  // so the tool never rejects the file it just wrote for you.
  'version',
])

/** Validate the raw (pre-normalisation) config and say what's wrong in its terms. */
export function validateRaw(raw: Raw, where: string): void {
  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k))
  if (unknown.length) {
    throw new ConfigError(
      `unknown setting in ${where}: ${unknown.join(', ')}\n` +
        `Valid settings: success_command, run_on_success, watch_paths, ignore, detectors, diff, privacy`,
    )
  }
  const detectors = raw.detectors
  if (detectors && typeof detectors === 'object' && !Array.isArray(detectors)) {
    const badIds = Object.keys(detectors as Raw).filter((k) => !(DETECTOR_IDS as readonly string[]).includes(k))
    if (badIds.length) {
      throw new ConfigError(
        `unknown detector in ${where}: ${badIds.join(', ')}\nValid detectors: ${DETECTOR_IDS.join(', ')}`,
      )
    }
  }
  const diff = raw.diff as Raw | undefined
  const failOn = (diff?.fail_on ?? raw.failOn ?? raw.fail_on) as string | undefined
  if (failOn !== undefined && !['blocking', 'likely', 'nice'].includes(failOn)) {
    throw new ConfigError(`"fail_on" is "${failOn}" in ${where} — must be one of: blocking, likely, nice`)
  }
}

export function loadConfig(root: string, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  let user: Partial<ResolvedConfig> = {}

  // These files are ours. A parse error here used to be swallowed, which is the
  // worst outcome available: the settings you carefully wrote were never read,
  // and the tool behaved as though you had written nothing.
  const yml = ['lastgood.yml', 'lastgood.yaml'].map((n) => join(root, n)).find((p) => existsSync(p))
  if (yml) {
    let parsed: unknown
    try {
      parsed = parseYaml(stripBom(readFileSync(yml, 'utf8')))
    } catch (e) {
      throw new ConfigError(
        `${basename(yml)} is not valid YAML: ${e instanceof Error ? e.message : String(e)}\n` +
          `Fix it (or delete it to use the defaults) — refusing to run with your settings ignored.`,
      )
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      validateRaw(parsed as Raw, basename(yml))
      user = normalizeConfig(parsed as Raw)
    } else if (parsed !== null && parsed !== undefined) {
      throw new ConfigError(`${basename(yml)} must contain a mapping of settings.`)
    }
  }

  const jsonPath = join(root, 'lastgood.config.json')
  if (existsSync(jsonPath)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(stripBom(readFileSync(jsonPath, 'utf8')))
    } catch (e) {
      throw new ConfigError(
        `lastgood.config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}\n` +
          `Fix it (or delete it to use the defaults) — refusing to run with your settings ignored.`,
      )
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError('lastgood.config.json must contain a JSON object.')
    }
    validateRaw(parsed as Raw, 'lastgood.config.json')
    user = { ...user, ...normalizeConfig(parsed as Raw) }
  }

  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg?.lastgood) {
        validateRaw(pkg.lastgood as Raw, 'the "lastgood" key in package.json')
        user = { ...normalizeConfig(pkg.lastgood), ...user }
      }
    } catch (e) {
      // A malformed package.json isn't ours to police — but a bad `lastgood` key
      // inside a perfectly good one is.
      if (e instanceof ConfigError) throw e
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

// Local storage under .lastgood/. Everything here is per-machine and never leaves
// the disk. The fingerprint + history + verified context are gitignored by default
// (they can contain machine-specific state); only the config is meant to be
// committed. We write that .gitignore ourselves so machine state can't be committed
// by accident.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Fingerprint } from './types.js'
import { SCHEMA_VERSION } from './types.js'

/** A parsed object is only a usable fingerprint if it's the right schema version
 * and has the container fields the diff engine iterates over — otherwise a stale,
 * hand-edited or truncated file would crash later with a cryptic TypeError. */
export function isValidFingerprint(x: unknown): x is Fingerprint {
  if (!x || typeof x !== 'object') return false
  const fp = x as Record<string, unknown>
  return (
    fp.schemaVersion === SCHEMA_VERSION &&
    !!fp.git && typeof fp.git === 'object' &&
    !!fp.lockfiles && typeof fp.lockfiles === 'object' &&
    !!fp.runtimes && typeof fp.runtimes === 'object' &&
    !!fp.envSchema && typeof fp.envSchema === 'object' &&
    !!fp.migrations && typeof fp.migrations === 'object' &&
    !!fp.fileHashes && typeof fp.fileHashes === 'object' &&
    Array.isArray(fp.dockerServices) &&
    Array.isArray(fp.ports) &&
    typeof fp.createdAt === 'string'
  )
}

export const DIR = '.lastgood'

const dir = (root: string): string => join(root, DIR)
const fingerprintPath = (root: string): string => join(dir(root), 'fingerprint.json')

const GITIGNORE = `# Machine-specific LastGood state — do not commit.
fingerprint.json
history/
verified-context.md
`

export function ensureDir(root: string): void {
  const d = dir(root)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  const gi = join(d, '.gitignore')
  if (!existsSync(gi)) writeFileSync(gi, GITIGNORE, 'utf8')
}

export function writeFingerprint(root: string, fp: Fingerprint): void {
  ensureDir(root)
  writeFileSync(fingerprintPath(root), JSON.stringify(fp, null, 2), 'utf8')
  // Keep a timestamped copy in history/ for park/resume and trend.
  const hist = join(dir(root), 'history')
  if (!existsSync(hist)) mkdirSync(hist, { recursive: true })
  const stamp = fp.createdAt.replace(/[:.]/g, '-')
  writeFileSync(join(hist, `${stamp}.json`), JSON.stringify(fp, null, 2), 'utf8')
  pruneHistory(hist, 20)
}

export function readFingerprint(root: string): Fingerprint | null {
  const p = fingerprintPath(root)
  if (!existsSync(p)) return null
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    return isValidFingerprint(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeContext(root: string, markdown: string): string {
  ensureDir(root)
  const p = join(dir(root), 'verified-context.md')
  writeFileSync(p, markdown, 'utf8')
  return p
}

export function hasFingerprint(root: string): boolean {
  return existsSync(fingerprintPath(root))
}

const parkPath = (root: string): string => join(dir(root), 'park.json')

export function writePark(root: string, fp: Fingerprint): void {
  ensureDir(root)
  writeFileSync(parkPath(root), JSON.stringify(fp, null, 2), 'utf8')
}

export function readPark(root: string): Fingerprint | null {
  const p = parkPath(root)
  if (!existsSync(p)) return null
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    return isValidFingerprint(parsed) ? parsed : null
  } catch {
    return null
  }
}

function pruneHistory(histDir: string, keep: number): void {
  try {
    const files = readdirSync(histDir).filter((f) => f.endsWith('.json')).sort()
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try {
        rmSync(join(histDir, f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

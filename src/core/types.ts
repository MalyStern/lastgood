// LastGood's vocabulary. The central artifact is a Fingerprint: a small, local-only
// snapshot of facts about the project at a moment it was known to work. Everything
// else compares two fingerprints (or a fingerprint against "now").
//
// Guiding rule shared across the suite: report FACTS, never guesses. A change item
// says "a migration was added and isn't applied locally" — not "the migration broke
// it". The developer (or their AI) draws the conclusion.

export type Runtime = 'node' | 'python' | 'java' | 'dotnet' | 'go' | 'ruby'

export type Severity = 'blocking' | 'likely' | 'nice' | 'info'

export const SCHEMA_VERSION = 1

export interface Fingerprint {
  schemaVersion: number
  tool: 'lastgood'
  /** ISO timestamp of when this snapshot was taken. */
  createdAt: string
  trigger: 'manual-mark' | 'auto-success' | 'park'
  machine: { os: string; arch: string }
  git: GitState
  /** lockfile name -> sha256 of its bytes. */
  lockfiles: Record<string, string>
  /** runtime -> installed version string (or null if not found). */
  runtimes: Partial<Record<Runtime, string | null>>
  envSchema: EnvSchema
  /** Declared docker-compose service names. */
  dockerServices: string[]
  /** Ports the project declares. */
  ports: number[]
  /** migration tool -> filesystem snapshot (never touches the DB). */
  migrations: Record<string, MigrationSnapshot>
  /** watched file -> sha256 (schema files, generated code, custom watch paths). */
  fileHashes: Record<string, string>
  /** The command that defined "working", and how it exited. */
  success?: { command: string; exitCode: number; ranAt: string; durationMs?: number }
  /** Free-text note left by `lastgood park`. */
  note?: string
}

export interface GitState {
  commit: string | null
  branch: string | null
  dirty: boolean
  /** Count of changed (uncommitted) files — paths/content are NOT stored. */
  changedCount: number
}

export interface EnvSchema {
  /** Sorted env-var KEY names (never values). */
  keys: string[]
  /** sha256 of the sorted key list. */
  keysHash: string
  sources: string[]
}

export interface MigrationSnapshot {
  /** Number of migration files on disk. */
  files: number
  /** sha256 of the sorted migration filenames. */
  filesHash: string
}

export interface Finding {
  detectorId: string
  severity: Severity
  title: string
  detail?: string
  fix?: { title: string; command?: string }
}

export interface ChangeReport {
  /** When the last-good snapshot was taken, and how. */
  lastGoodAt: string
  lastGoodTrigger: Fingerprint['trigger']
  findings: Finding[]
  worst: Severity | null
  exitCode: number
}

export interface ResolvedConfig {
  successCommand?: string
  runOnSuccess: boolean
  privacy: { storeEnvValues: false; cloudSync: false }
  /** detector id -> enabled. Missing = enabled. */
  detectors: Record<string, boolean>
  /** Extra files to hash into the fingerprint. */
  watchPaths: string[]
  /** Globs to ignore. */
  ignore: string[]
  /** Exit non-zero at/above this level for `diff --ci`. */
  failOn: Exclude<Severity, 'info'>
  /** Migration tools to snapshot. */
  migrationTools: string[]
  /** Files whose hash is tracked (schema/generated). */
  schemaFiles: string[]
}

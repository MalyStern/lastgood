// The heart of LastGood: given the last-good fingerprint and a fresh one, compute
// the prioritized list of what changed — each item a FACT plus a runnable fix.
// Pure function of two fingerprints, so the whole thing is unit-testable.

import semver from 'semver'
import type { Finding, Fingerprint, Runtime } from './types.js'

const INSTALL_FOR_LOCK: Record<string, string> = {
  'package-lock.json': 'npm install',
  'npm-shrinkwrap.json': 'npm install',
  'pnpm-lock.yaml': 'pnpm install',
  'yarn.lock': 'yarn install',
  'bun.lockb': 'bun install',
  'bun.lock': 'bun install',
  'requirements.txt': 'pip install -r requirements.txt',
  'poetry.lock': 'poetry install',
  'uv.lock': 'uv sync',
  'Pipfile.lock': 'pipenv install',
  'Cargo.lock': 'cargo build',
  'go.sum': 'go mod download',
  'Gemfile.lock': 'bundle install',
  'composer.lock': 'composer install',
  'gradle.lockfile': './gradlew build',
}

const MIGRATE_CMD: Record<string, string> = {
  prisma: 'npx prisma migrate dev',
  drizzle: 'npx drizzle-kit migrate',
  alembic: 'alembic upgrade head',
  flyway: 'flyway migrate',
  rails: 'bin/rails db:migrate',
  django: 'python manage.py migrate',
}

const RUNTIME_SWITCH: Record<Runtime, (v: string) => string> = {
  node: (v) => `nvm use ${v}   # or fnm/volta`,
  python: (v) => `pyenv local ${v}`,
  java: (v) => `sdk use java ${v}`,
  dotnet: (v) => `select .NET SDK ${v}`,
  go: (v) => `switch to Go ${v}`,
  ruby: (v) => `rbenv local ${v}`,
}

/** Compare two fingerprints (last-good -> current). Pure. */
export function diffFingerprints(lastGood: Fingerprint, current: Fingerprint): Finding[] {
  const findings: Finding[] = []

  // --- Lockfiles / dependencies ---
  const lockNames = new Set([...Object.keys(lastGood.lockfiles), ...Object.keys(current.lockfiles)])
  for (const name of [...lockNames].sort()) {
    const before = lastGood.lockfiles[name]
    const after = current.lockfiles[name]
    if (before && after && before !== after) {
      findings.push({
        detectorId: 'lockfiles',
        severity: 'blocking',
        title: `${name} changed since your last-good state`,
        detail: 'Dependencies were updated. Reinstall so your installed packages match the lockfile.',
        fix: { title: 'Reinstall dependencies', command: INSTALL_FOR_LOCK[name] ?? 'reinstall dependencies' },
      })
    } else if (!before && after) {
      findings.push({
        detectorId: 'lockfiles',
        severity: 'likely',
        title: `New lockfile ${name} appeared since last-good`,
        fix: { title: 'Install dependencies', command: INSTALL_FOR_LOCK[name] ?? 'install dependencies' },
      })
    }
  }

  // --- Runtimes ---
  const runtimes = new Set([...Object.keys(lastGood.runtimes), ...Object.keys(current.runtimes)]) as Set<Runtime>
  for (const rt of runtimes) {
    const before = lastGood.runtimes[rt]
    const after = current.runtimes[rt]
    if (before && after && before !== after) {
      const b = semver.coerce(before)
      const a = semver.coerce(after)
      const major = b && a && b.major !== a.major
      findings.push({
        detectorId: 'runtimes',
        severity: major ? 'blocking' : 'likely',
        title: `${rt} changed: ${before} at last-good, now ${after}`,
        fix: { title: `Switch ${rt} back to ${before}, or re-mark if the new version is intended`, command: RUNTIME_SWITCH[rt](before) },
      })
    } else if (before && !after) {
      // The runtime was present when it worked and is now gone — a real regression
      // that the "what changed" tool must not miss.
      findings.push({
        detectorId: 'runtimes',
        severity: 'blocking',
        title: `${rt} was ${before} at last-good but is not found now`,
        fix: { title: `Reinstall ${rt} ${before}`, command: RUNTIME_SWITCH[rt](before) },
      })
    }
  }

  // --- Env schema (keys only) ---
  const beforeKeys = new Set(lastGood.envSchema.keys)
  const afterKeys = new Set(current.envSchema.keys)
  const addedKeys = [...afterKeys].filter((k) => !beforeKeys.has(k))
  const removedKeys = [...beforeKeys].filter((k) => !afterKeys.has(k))
  if (addedKeys.length) {
    findings.push({
      detectorId: 'env_schema',
      severity: 'blocking',
      title: `${addedKeys.length} new env var${addedKeys.length > 1 ? 's are' : ' is'} expected: ${addedKeys.join(', ')}`,
      detail: 'These keys appeared in the example env since last-good. Add them to your local .env (values are never read).',
      fix: { title: 'Add the new keys to your .env and give them values' },
    })
  }
  if (removedKeys.length) {
    findings.push({
      detectorId: 'env_schema',
      severity: 'nice',
      title: `${removedKeys.length} env var${removedKeys.length > 1 ? 's are' : ' is'} no longer expected: ${removedKeys.join(', ')}`,
      fix: { title: 'You can remove these from your .env if you like.' },
    })
  }

  // --- Migrations (filesystem tier) ---
  const migTools = new Set([...Object.keys(lastGood.migrations), ...Object.keys(current.migrations)])
  for (const tool of migTools) {
    const before = lastGood.migrations[tool]?.files ?? 0
    const after = current.migrations[tool]?.files ?? 0
    if (after > before) {
      const n = after - before
      findings.push({
        detectorId: 'migrations',
        severity: 'blocking',
        title: `${n} ${tool} migration${n > 1 ? 's were' : ' was'} added since last-good and may not be applied locally`,
        detail: `Migration files: ${before} → ${after}. LastGood counts files on disk; it does not touch your database.`,
        fix: { title: `Apply pending ${tool} migrations`, command: MIGRATE_CMD[tool] ?? `apply ${tool} migrations` },
      })
    } else if (after < before) {
      findings.push({
        detectorId: 'migrations',
        severity: 'likely',
        title: `${tool} migration files decreased (${before} → ${after}) since last-good`,
        fix: { title: 'Check your branch — you may be behind or on a different history.' },
      })
    } else if (after === before && after > 0) {
      // Same count but a different set (a migration was renamed/replaced) — caught
      // via the filenames hash so a swap isn't silently missed.
      const hb = lastGood.migrations[tool]?.filesHash
      const ha = current.migrations[tool]?.filesHash
      if (hb && ha && hb !== ha) {
        findings.push({
          detectorId: 'migrations',
          severity: 'likely',
          title: `${tool} migration files changed since last-good (same count, different set)`,
          detail: 'A migration was renamed or replaced. Check whether your local DB matches.',
          fix: { title: `Review and apply ${tool} migrations`, command: MIGRATE_CMD[tool] ?? `apply ${tool} migrations` },
        })
      }
    }
  }

  // --- Schema / generated files ---
  const fileNames = new Set([...Object.keys(lastGood.fileHashes), ...Object.keys(current.fileHashes)])
  for (const f of [...fileNames].sort()) {
    const before = lastGood.fileHashes[f]
    const after = current.fileHashes[f]
    if (before && after && before !== after) {
      findings.push({
        detectorId: 'schema',
        severity: 'likely',
        title: `${f} changed since last-good`,
        detail: 'A schema or generated file changed. You may need to regenerate client code or run a migration.',
        fix: { title: 'Regenerate/apply as appropriate for this file.' },
      })
    }
  }

  // --- Docker services ---
  const beforeSvc = new Set(lastGood.dockerServices)
  const afterSvc = new Set(current.dockerServices)
  const addedSvc = [...afterSvc].filter((s) => !beforeSvc.has(s))
  if (addedSvc.length) {
    findings.push({
      detectorId: 'docker',
      severity: 'likely',
      title: `New docker service${addedSvc.length > 1 ? 's' : ''} since last-good: ${addedSvc.join(', ')}`,
      fix: { title: 'Start the new service(s)', command: `docker compose up -d ${addedSvc.join(' ')}` },
    })
  }

  // --- Ports ---
  const addedPorts = current.ports.filter((p) => !lastGood.ports.includes(p))
  if (addedPorts.length) {
    findings.push({
      detectorId: 'ports',
      severity: 'nice',
      title: `New declared port${addedPorts.length > 1 ? 's' : ''} since last-good: ${addedPorts.join(', ')}`,
      fix: { title: 'Make sure the new port(s) are free when you run.' },
    })
  }

  // --- Git orientation (informational) ---
  if (lastGood.git.commit && current.git.commit && lastGood.git.commit !== current.git.commit) {
    const branchNote =
      lastGood.git.branch !== current.git.branch
        ? ` (branch ${lastGood.git.branch} → ${current.git.branch})`
        : ''
    findings.push({
      detectorId: 'git',
      severity: 'nice',
      title: `HEAD moved since last-good${branchNote}: ${short(lastGood.git.commit)} → ${short(current.git.commit)}`,
    })
  }

  return findings
}

const short = (sha: string): string => sha.slice(0, 8)

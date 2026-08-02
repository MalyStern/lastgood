import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { diffFingerprints } from '../src/core/diff.js'
import { parseEnvKeys, capturePorts, captureMigrations } from '../src/engine/capture.js'
import { loadConfig, normalizeConfig } from '../src/core/config.js'
import { EXAMPLE_YML } from '../src/core/example-config.js'
import { DETECTOR_IDS } from '../src/core/types.js'
import { exitCodeFor, worstOf } from '../src/core/result.js'
import { generateContext } from '../src/core/context.js'
import { isValidFingerprint } from '../src/core/store.js'
import { detectLang, makeTranslator } from '../src/core/i18n.js'
import {
  buildHookBlock,
  hasHookBlock,
  injectHookBlock,
  stripHookBlock,
  HOOK_START,
  HOOK_END,
} from '../src/core/hooks.js'
import type { Finding, Fingerprint } from '../src/core/types.js'

const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  schemaVersion: 1,
  tool: 'lastgood',
  createdAt: '2026-07-27T08:00:00.000Z',
  trigger: 'manual-mark',
  machine: { os: 'linux', arch: 'x64' },
  git: { commit: 'a'.repeat(40), branch: 'main', dirty: false, changedCount: 0 },
  lockfiles: {},
  runtimes: {},
  envSchema: { keys: [], keysHash: '', sources: [] },
  dockerServices: [],
  ports: [],
  migrations: {},
  fileHashes: {},
  ...over,
})

const ids = (f: Finding[]): string[] => f.map((x) => `${x.detectorId}:${x.severity}`)

describe('parseEnvKeys', () => {
  it('extracts key names only, ignoring comments and blanks', () => {
    expect(parseEnvKeys('# c\nDATABASE_URL=postgres://x\nexport TOKEN=abc\nSTRIPE_KEY=\n\nnope\n')).toEqual([
      'DATABASE_URL', 'TOKEN', 'STRIPE_KEY',
    ])
  })
})

describe('capturePorts (privacy)', () => {
  it('returns [] when no compose/env present under a bogus root', () => {
    expect(capturePorts('/definitely/not/a/real/path/xyz')).toEqual([])
  })

  it('NEVER reads the real .env, and matches PORT only as a whole token', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lg-ports-'))
    try {
      // A real .env with a genuine PORT and a secret whose key contains "PORT".
      writeFileSync(join(dir, '.env'), 'PORT=9999\nSUPPORT_TOKEN=12345secret\n')
      // The example only declares SERVER_PORT and a decoy secret-ish key.
      writeFileSync(join(dir, '.env.example'), 'SERVER_PORT=3000\nPASSPORT_ID=54321\nDATABASE_URL=\n')
      const ports = capturePorts(dir)
      expect(ports).toContain(3000) // real port key in the example
      expect(ports).not.toContain(9999) // came from the real .env — must be ignored
      expect(ports).not.toContain(54321) // PASSPORT is not a PORT key
      expect(ports).not.toContain(12345) // from .env, and not a PORT key anyway
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('isValidFingerprint', () => {
  it('rejects malformed/stale objects and accepts a valid one', () => {
    expect(isValidFingerprint({})).toBe(false)
    expect(isValidFingerprint(null)).toBe(false)
    expect(isValidFingerprint({ schemaVersion: 999, git: {} })).toBe(false)
    expect(isValidFingerprint(fp())).toBe(true)
  })
})

describe('diffFingerprints', () => {
  it('flags a changed lockfile as blocking with the right install command', () => {
    const f = diffFingerprints(fp({ lockfiles: { 'pnpm-lock.yaml': 'a' } }), fp({ lockfiles: { 'pnpm-lock.yaml': 'b' } }))
    expect(ids(f)).toContain('lockfiles:blocking')
    expect(f[0]!.fix?.command).toBe('pnpm install')
  })

  it('flags runtime major change as blocking, minor as likely', () => {
    const major = diffFingerprints(fp({ runtimes: { node: '20.1.0' } }), fp({ runtimes: { node: '22.0.0' } }))
    expect(ids(major)).toContain('runtimes:blocking')
    const minor = diffFingerprints(fp({ runtimes: { node: '20.1.0' } }), fp({ runtimes: { node: '20.5.0' } }))
    expect(ids(minor)).toContain('runtimes:likely')
  })

  it('flags a newly-expected env key as blocking and a removed one as nice', () => {
    const added = diffFingerprints(
      fp({ envSchema: { keys: ['A'], keysHash: '', sources: [] } }),
      fp({ envSchema: { keys: ['A', 'B'], keysHash: '', sources: [] } }),
    )
    expect(added.find((x) => x.detectorId === 'env_schema')?.severity).toBe('blocking')
    const removed = diffFingerprints(
      fp({ envSchema: { keys: ['A', 'B'], keysHash: '', sources: [] } }),
      fp({ envSchema: { keys: ['A'], keysHash: '', sources: [] } }),
    )
    expect(removed.find((x) => x.detectorId === 'env_schema')?.severity).toBe('nice')
  })

  it('flags a runtime that disappeared as blocking', () => {
    const f = diffFingerprints(fp({ runtimes: { node: '20.1.0' } }), fp({ runtimes: {} }))
    const r = f.find((x) => x.detectorId === 'runtimes')!
    expect(r.severity).toBe('blocking')
    expect(r.title).toContain('not found')
  })

  it('flags a migration set swap (same count, different hash) as likely', () => {
    const f = diffFingerprints(
      fp({ migrations: { prisma: { files: 2, filesHash: 'aaa' } } }),
      fp({ migrations: { prisma: { files: 2, filesHash: 'bbb' } } }),
    )
    expect(f.find((x) => x.detectorId === 'migrations')?.severity).toBe('likely')
  })

  it('flags an added migration as blocking', () => {
    const f = diffFingerprints(
      fp({ migrations: { prisma: { files: 1, filesHash: 'a' } } }),
      fp({ migrations: { prisma: { files: 2, filesHash: 'b' } } }),
    )
    const m = f.find((x) => x.detectorId === 'migrations')!
    expect(m.severity).toBe('blocking')
    expect(m.fix?.command).toBe('npx prisma migrate dev')
  })

  it('hands the right apply command for a newly-added migration per tool', () => {
    const added = (tool: string): string | undefined => {
      const f = diffFingerprints(
        fp({ migrations: { [tool]: { files: 1, filesHash: 'a' } } }),
        fp({ migrations: { [tool]: { files: 2, filesHash: 'b' } } }),
      )
      return f.find((x) => x.detectorId === 'migrations')?.fix?.command
    }
    expect(added('rails')).toBe('bin/rails db:migrate')
    expect(added('django')).toBe('python manage.py migrate')
    expect(added('alembic')).toBe('alembic upgrade head')
    expect(added('flyway')).toBe('flyway migrate')
  })

  it('flags a changed schema file as likely and a new docker service as likely', () => {
    const schema = diffFingerprints(fp({ fileHashes: { 'schema.prisma': 'a' } }), fp({ fileHashes: { 'schema.prisma': 'b' } }))
    expect(schema.find((x) => x.detectorId === 'schema')?.severity).toBe('likely')
    const svc = diffFingerprints(fp({ dockerServices: ['db'] }), fp({ dockerServices: ['db', 'redis'] }))
    expect(svc.find((x) => x.detectorId === 'docker')?.severity).toBe('likely')
  })

  it('notes a moved HEAD as nice, and reports nothing when identical', () => {
    const moved = diffFingerprints(fp({ git: { commit: 'a'.repeat(40), branch: 'main', dirty: false, changedCount: 0 } }), fp({ git: { commit: 'b'.repeat(40), branch: 'main', dirty: false, changedCount: 0 } }))
    expect(moved.find((x) => x.detectorId === 'git')?.severity).toBe('nice')
    expect(diffFingerprints(fp(), fp())).toEqual([])
  })
})

describe('captureMigrations (filesystem tier — never touches a DB)', () => {
  const withDir = (fn: (dir: string) => void): void => {
    const dir = mkdtempSync(join(tmpdir(), 'lg-mig-'))
    try {
      fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const mk = (dir: string, rel: string, body = ''): void => {
    const abs = join(dir, ...rel.split('/'))
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }

  it('counts Rails db/migrate/*.rb and hashes the filename set', () => {
    withDir((dir) => {
      mk(dir, 'db/migrate/20260101_a.rb', 'x')
      mk(dir, 'db/migrate/20260102_b.rb', 'x')
      mk(dir, 'db/migrate/.keep')
      const snap = captureMigrations(dir, ['rails']).rails
      expect(snap?.files).toBe(2)
      expect(snap?.filesHash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  it('counts Alembic revisions under a custom script_location and skips __init__.py', () => {
    withDir((dir) => {
      mk(dir, 'alembic.ini', '[alembic]\nscript_location = db/migrations\n')
      mk(dir, 'db/migrations/versions/r1.py', 'x')
      mk(dir, 'db/migrations/versions/r2.py', 'x')
      mk(dir, 'db/migrations/versions/__init__.py', '')
      expect(captureMigrations(dir, ['alembic']).alembic?.files).toBe(2)
    })
  })

  it('counts Flyway V/U/R__*.sql and ignores ad-hoc .sql', () => {
    withDir((dir) => {
      mk(dir, 'sql/V1__init.sql', 'x')
      mk(dir, 'sql/R__view.sql', 'x')
      mk(dir, 'sql/notes.sql', 'x')
      expect(captureMigrations(dir, ['flyway']).flyway?.files).toBe(2)
    })
  })

  it('counts Django migrations across apps (manage.py required), skipping venvs', () => {
    withDir((dir) => {
      mk(dir, 'manage.py', '#!/usr/bin/env python\n')
      mk(dir, 'users/migrations/__init__.py')
      mk(dir, 'users/migrations/0001_initial.py')
      mk(dir, 'orders/migrations/__init__.py')
      mk(dir, 'orders/migrations/0001_initial.py')
      mk(dir, 'orders/migrations/0002_status.py')
      mk(dir, '.venv/pkg/migrations/__init__.py')
      mk(dir, '.venv/pkg/migrations/0001_vendored.py')
      expect(captureMigrations(dir, ['django']).django?.files).toBe(3)
    })
  })

  it('does not report Django without a manage.py marker', () => {
    withDir((dir) => {
      mk(dir, 'app/migrations/__init__.py')
      mk(dir, 'app/migrations/0001_initial.py')
      expect(captureMigrations(dir, ['django']).django).toBeUndefined()
    })
  })

  it('respects the tools list — an unlisted tool is not captured', () => {
    withDir((dir) => {
      mk(dir, 'db/migrate/20260101_a.rb', 'x')
      expect(captureMigrations(dir, ['prisma']).rails).toBeUndefined()
    })
  })
})

describe('normalizeConfig', () => {
  it('maps the documented yaml shape', () => {
    const c = normalizeConfig({
      success_command: 'npm test',
      run_on_success: false,
      watch_paths: ['a.yml'],
      ignore: ['*.log'],
      diff: { fail_on: 'likely' },
      detectors: { docker: { enabled: false }, migrations: { enabled: true, tools: ['prisma'] } },
    })
    expect(c.successCommand).toBe('npm test')
    expect(c.runOnSuccess).toBe(false)
    expect(c.watchPaths).toEqual(['a.yml'])
    expect(c.failOn).toBe('likely')
    expect(c.detectors?.docker).toBe(false)
    expect(c.migrationTools).toEqual(['prisma'])
  })
})

describe('result helpers', () => {
  const f = (s: Finding['severity']): Finding => ({ detectorId: 'x', severity: s, title: '' })
  it('worstOf and exitCodeFor', () => {
    expect(worstOf([f('nice'), f('blocking')])).toBe('blocking')
    expect(worstOf([])).toBeNull()
    expect(exitCodeFor('blocking', 'blocking')).toBe(2)
    expect(exitCodeFor('likely', 'blocking')).toBe(0)
    expect(exitCodeFor('likely', 'likely')).toBe(1)
    expect(exitCodeFor(null, 'blocking')).toBe(0)
  })
})

describe('generateContext', () => {
  it('is facts-only and includes the no-inference disclaimer', () => {
    const md = generateContext(
      fp({ runtimes: { node: '20.0.0' } }),
      fp({ runtimes: { node: '22.0.0' } }),
      diffFingerprints(fp({ runtimes: { node: '20.0.0' } }), fp({ runtimes: { node: '22.0.0' } })),
    )
    expect(md).toContain('facts only, no inference')
    expect(md).toContain('draws no conclusions about causes')
    expect(md).toContain('CHANGED')
  })
})

describe('i18n', () => {
  it('translates, falls back per key, detects language', () => {
    expect(makeTranslator('he').t('fix')).toBe('תיקון')
    expect(makeTranslator('he').rtl).toBe(true)
    expect(makeTranslator('qq').t('fix')).toBe('Fix')
    expect(detectLang('de_DE.UTF-8')).toBe('de')
    expect(detectLang('xyz')).toBe('en')
    expect(makeTranslator('en').t('summary', { b: 2, l: 1, n: 0 })).toBe('2 blocking · 1 likely · 0 nice')
  })
})

describe('git hooks (pure block logic)', () => {
  it('builds a nudge-only block — it prints the reminder and never runs a fix', () => {
    const block = buildHookBlock('post-merge')
    expect(block.startsWith(HOOK_START)).toBe(true)
    expect(block.trimEnd().endsWith(HOOK_END)).toBe(true)
    expect(block).toContain("lastgood morning")
    expect(block).toContain('never runs a fix')
    // It must not invoke morning/diff/mark — only echo a reminder.
    expect(block).not.toMatch(/^\s*(npx\s+)?lastgood\s+(morning|diff|mark)/m)
    // Silent until a good state exists.
    expect(block).toContain('.lastgood/fingerprint.json')
  })

  it('guards post-checkout to branch switches only, but not post-merge', () => {
    expect(buildHookBlock('post-checkout')).toContain('[ "$3" = "1" ] || exit 0')
    expect(buildHookBlock('post-merge')).not.toContain('"$3"')
  })

  it('creates a shebang script when there is no existing hook', () => {
    const out = injectHookBlock('', buildHookBlock('post-merge'))
    expect(out.startsWith('#!/bin/sh\n')).toBe(true)
    expect(hasHookBlock(out)).toBe(true)
  })

  it('appends to an existing hook without clobbering it', () => {
    const existing = '#!/bin/sh\n# my husky hook\nnpx lint-staged\n'
    const out = injectHookBlock(existing, buildHookBlock('post-checkout'))
    expect(out).toContain('npx lint-staged') // original preserved
    expect(out).toContain(HOOK_START)
    expect(out.indexOf('npx lint-staged')).toBeLessThan(out.indexOf(HOOK_START)) // appended after
  })

  it('is idempotent — injecting twice does not duplicate the block', () => {
    const once = injectHookBlock('#!/bin/sh\n', buildHookBlock('post-merge'))
    const twice = injectHookBlock(once, buildHookBlock('post-merge'))
    expect(twice).toBe(once)
    expect(twice.match(new RegExp(HOOK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1)
  })

  it('strips only its own block, leaving the surrounding hook intact', () => {
    const existing = '#!/bin/sh\nnpx lint-staged\n'
    const withBlock = injectHookBlock(existing, buildHookBlock('post-merge'))
    const stripped = stripHookBlock(withBlock)
    expect(hasHookBlock(stripped)).toBe(false)
    expect(stripped).toContain('npx lint-staged')
    expect(stripped).not.toContain(HOOK_END)
  })

  it('leaves content untouched when there is no block to strip', () => {
    const content = '#!/bin/sh\necho hi\n'
    expect(stripHookBlock(content)).toBe(content)
  })
})

describe('config: settings the user can actually see and trust', () => {
  const tmp = (): string => mkdtempSync(join(tmpdir(), 'lg-cfg-'))

  it('accepts the very file `lastgood init` writes', () => {
    // A tool whose own starter config its own loader then rejects is the worst
    // first impression available. This is the test that keeps the two in step.
    const root = tmp()
    writeFileSync(join(root, 'lastgood.yml'), EXAMPLE_YML)
    const c = loadConfig(root)
    expect(c.failOn).toBe('blocking')
    expect(c.privacy.storeEnvValues).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('reports broken YAML instead of silently ignoring your settings', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.yml'), 'detectors:\n  git: true\n bad indent here: [')
    expect(() => loadConfig(root)).toThrow(/not valid YAML/)
    expect(() => loadConfig(root)).toThrow(/settings ignored/)
    rmSync(root, { recursive: true, force: true })
  })

  it('reports broken JSON config too', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.config.json'), '{ "ignore": ["a" }')
    expect(() => loadConfig(root)).toThrow(/not valid JSON/)
    rmSync(root, { recursive: true, force: true })
  })

  it('reads a config saved by Notepad or PowerShell (UTF-8 BOM)', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.config.json'), '﻿{ "ignore": ["tmp/**"] }')
    expect(loadConfig(root).ignore).toEqual(['tmp/**'])
    rmSync(root, { recursive: true, force: true })
  })

  it('catches a misspelled setting rather than dropping it in silence', () => {
    const root = tmp()
    // The whole point: normalizeConfig would quietly ignore this and the user
    // would never learn their success command was never configured.
    writeFileSync(join(root, 'lastgood.yml'), 'success_comand: npm test\n')
    expect(() => loadConfig(root)).toThrow(/unknown setting/)
    expect(() => loadConfig(root)).toThrow(/success_command/)
    rmSync(root, { recursive: true, force: true })
  })

  it('catches a misspelled detector and lists the real ones', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.yml'), 'detectors:\n  lockfile: false\n')
    expect(() => loadConfig(root)).toThrow(/unknown detector/)
    expect(() => loadConfig(root)).toThrow(/lockfiles/)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a fail_on that is not a real level', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.yml'), 'diff:\n  fail_on: critical\n')
    expect(() => loadConfig(root)).toThrow(/must be one of/)
    rmSync(root, { recursive: true, force: true })
  })

  it('a valid config still applies', () => {
    const root = tmp()
    writeFileSync(join(root, 'lastgood.yml'), 'success_command: npm test\nignore: ["tmp/**"]\ndiff:\n  fail_on: nice\n')
    const c = loadConfig(root)
    expect(c.successCommand).toBe('npm test')
    expect(c.ignore).toEqual(['tmp/**'])
    expect(c.failOn).toBe('nice')
    rmSync(root, { recursive: true, force: true })
  })

  it('no config at all is still perfectly fine', () => {
    const root = tmp()
    expect(loadConfig(root).failOn).toBe('blocking')
    rmSync(root, { recursive: true, force: true })
  })

  it('every detector the capture engine consults is a valid config id', () => {
    // Guards the other direction: a detector you can switch off must exist.
    for (const id of DETECTOR_IDS) expect(EXAMPLE_YML).toContain(`${id}:`)
  })
})

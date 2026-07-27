import { describe, expect, it } from 'vitest'
import { diffFingerprints } from '../src/core/diff.js'
import { parseEnvKeys, capturePorts } from '../src/engine/capture.js'
import { normalizeConfig } from '../src/core/config.js'
import { exitCodeFor, worstOf } from '../src/core/result.js'
import { generateContext } from '../src/core/context.js'
import { detectLang, makeTranslator } from '../src/core/i18n.js'
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

describe('capturePorts (framework defaults path)', () => {
  it('returns [] when no compose/env present under a bogus root', () => {
    expect(capturePorts('/definitely/not/a/real/path/xyz')).toEqual([])
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

  it('flags an added migration as blocking', () => {
    const f = diffFingerprints(
      fp({ migrations: { prisma: { files: 1, filesHash: 'a' } } }),
      fp({ migrations: { prisma: { files: 2, filesHash: 'b' } } }),
    )
    const m = f.find((x) => x.detectorId === 'migrations')!
    expect(m.severity).toBe('blocking')
    expect(m.fix?.command).toBe('npx prisma migrate dev')
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

// The Commander program. Kept out of cli.ts so the bootstrap can set colour env
// before any colour-reading module is imported.

import { Command } from 'commander'
import { execa } from 'execa'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReport, captureCurrent, generateContext, mark, resolveConfig } from '../index.js'
import { readFingerprint, readPark, writeContext, writePark } from './store.js'
import { detectLang, makeTranslator, SUPPORTED_LANGS } from './i18n.js'
import { EXAMPLE_YML } from './example-config.js'
import { installHooks, uninstallHooks } from './hooks.js'
import { renderReport } from './report/tty.js'
import { renderMarkdown } from './report/markdown.js'
import { countBySeverity } from './report/tty.js'
import type { ChangeReport } from './types.js'

export const VERSION = '0.1.0'


export async function main(argv: string[]): Promise<void> {
  const program = new Command()
  program
    .name('lastgood')
    .description('Find out exactly what changed since your project last worked on your machine. Local; nothing uploaded.')
    .version(VERSION, '-v, --version')

  program
    .command('init')
    .description('scaffold lastgood.yml and the .lastgood/ directory')
    .action(() => cmdInit())

  program
    .command('mark')
    .description('save the current state as the last-good snapshot (run this when the project works)')
    .option('--note <text>', 'attach a note to this snapshot')
    .option('--lang <code>', 'UI language')
    .option('--no-color', 'disable coloured output')
    .action((opts) => cmdMark(opts))

  const diffCmd = (name: string): Command =>
    program
      .command(name)
      .description(name === 'morning' ? 'what changed since last-good (framed for after a pull/switch)' : 'show what changed since the last-good snapshot')
      .option('--json', 'machine-readable JSON')
      .option('--report [file]', 'also write a markdown report (default: lastgood-report.md)')
      .option('--lang <code>', 'UI language')
      .option('--no-color', 'disable coloured output')
      .action((opts) => cmdDiff(opts))
  diffCmd('diff')
  diffCmd('morning')

  program
    .command('context')
    .description('write .lastgood/verified-context.md — verified facts for an AI coding agent')
    .option('--no-color', 'disable coloured output')
    .action(() => cmdContext())

  program
    .command('park')
    .description('save an end-of-day capsule (state + a note to your future self)')
    .option('--note <text>', 'a note for when you resume')
    .option('--no-color', 'disable coloured output')
    .action((opts) => cmdPark(opts))

  program
    .command('resume')
    .description('replay your last park capsule and show what changed since')
    .option('--lang <code>', 'UI language')
    .option('--no-color', 'disable coloured output')
    .action((opts) => cmdResume(opts))

  program
    .command('run')
    .description('run your success command; if it exits 0, auto-save a last-good snapshot')
    .argument('<cmd...>', 'the command to run, e.g. -- npm test')
    .action((cmd) => cmdRun(cmd))

  program
    .command('install-hooks')
    .description('install git post-merge/post-checkout hooks that nudge you to run `lastgood morning` (never runs a fix)')
    .action(async () => {
      try {
        console.log(await installHooks(cwd()))
      } catch (e) {
        console.error(`lastgood: ${e instanceof Error ? e.message : String(e)}`)
        process.exit(3)
      }
    })

  program
    .command('uninstall-hooks')
    .description('remove the LastGood git hooks')
    .action(async () => {
      try {
        console.log(await uninstallHooks(cwd()))
      } catch (e) {
        console.error(`lastgood: ${e instanceof Error ? e.message : String(e)}`)
        process.exit(3)
      }
    })

  program
    .command('langs')
    .description('list the supported UI languages')
    .action(() => console.log(SUPPORTED_LANGS.join(', ')))

  // Default (no subcommand) = diff.
  program.action(() => cmdDiff({}))

  await program.parseAsync(argv)
}

// --- command handlers ---

const cwd = (): string => process.cwd()

function cmdInit(): void {
  const ymlPath = join(cwd(), 'lastgood.yml')
  if (existsSync(ymlPath)) {
    console.log('lastgood.yml already exists — leaving it as is.')
  } else {
    writeFileSync(ymlPath, EXAMPLE_YML, 'utf8')
    console.log('Created lastgood.yml')
  }
  console.log('Next: get the project working, then run `lastgood mark`. Later, after a pull, run `lastgood morning`.')
}

async function cmdMark(opts: { note?: string; lang?: string }): Promise<void> {
  const config = resolveConfig(cwd())
  const fp = await mark(cwd(), config, { trigger: 'manual-mark', note: opts.note })
  const tr = makeTranslator(detectLang(opts.lang))
  console.log(tr.t('marked'))
  const rt = Object.entries(fp.runtimes).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')
  const bits = [
    fp.git.commit ? `commit ${fp.git.commit.slice(0, 8)} (${fp.git.branch})` : null,
    rt || null,
    Object.keys(fp.lockfiles).length ? `${Object.keys(fp.lockfiles).length} lockfile(s)` : null,
    fp.envSchema.keys.length ? `${fp.envSchema.keys.length} env keys` : null,
  ].filter(Boolean)
  if (bits.length) console.log(`  ${bits.join(' · ')}`)
}

async function loadReport(config = resolveConfig(cwd())): Promise<ChangeReport | 'none'> {
  const baseline = readFingerprint(cwd())
  if (!baseline) return 'none'
  const current = await captureCurrent(cwd(), config, { trigger: 'manual-mark' })
  return buildReport(baseline, current, config)
}

async function cmdDiff(opts: { json?: boolean; report?: string | boolean; lang?: string; color?: boolean }): Promise<void> {
  const tr = makeTranslator(detectLang(opts.lang))
  const config = resolveConfig(cwd())
  const report = await loadReport(config)
  if (report === 'none') {
    console.log(`\n  ${tr.t('noFingerprint')}\n`)
    process.exit(0)
  }
  if (opts.report) {
    const file = typeof opts.report === 'string' ? opts.report : 'lastgood-report.md'
    writeFileSync(file, renderMarkdown(report, cwd()), 'utf8')
    if (!opts.json) console.error(`lastgood: wrote ${file}`)
  }
  if (opts.json) {
    const c = countBySeverity(report.findings)
    process.stdout.write(JSON.stringify({ schemaVersion: 1, tool: 'lastgood', ...report, counts: c }, null, 2) + '\n')
  } else {
    process.stdout.write(renderReport(report, tr, cwd()))
  }
  process.exit(report.exitCode)
}

async function cmdContext(): Promise<void> {
  const config = resolveConfig(cwd())
  const baseline = readFingerprint(cwd())
  if (!baseline) {
    console.log(`\n  ${makeTranslator(detectLang()).t('noFingerprint')}\n`)
    process.exit(0)
  }
  const current = await captureCurrent(cwd(), config, { trigger: 'manual-mark' })
  const findings = buildReport(baseline, current, config).findings
  const md = generateContext(baseline, current, findings)
  const p = writeContext(cwd(), md)
  console.log(`Wrote ${p}`)
  console.log('Point your AI agent at it (e.g. reference .lastgood/verified-context.md in your prompt or AGENTS.md).')
}

async function cmdPark(opts: { note?: string }): Promise<void> {
  const config = resolveConfig(cwd())
  const fp = await captureCurrent(cwd(), config, { trigger: 'park', note: opts.note })
  writePark(cwd(), fp)
  console.log('Parked. Resume tomorrow with `lastgood resume`.')
  if (opts.note) console.log(`  note: ${opts.note}`)
}

async function cmdResume(opts: { lang?: string }): Promise<void> {
  const tr = makeTranslator(detectLang(opts.lang))
  const config = resolveConfig(cwd())
  const park = readPark(cwd())
  if (!park) {
    console.log('\n  Nothing parked. Use `lastgood park` at the end of your day.\n')
    process.exit(0)
  }
  console.log(`\nWelcome back. You parked on ${new Date(park.createdAt).toLocaleString()}.`)
  if (park.git.branch) console.log(`  branch: ${park.git.branch}${park.git.commit ? ` @ ${park.git.commit.slice(0, 8)}` : ''}`)
  if (park.note) console.log(`  your note: ${park.note}`)
  const current = await captureCurrent(cwd(), config, { trigger: 'manual-mark' })
  const report = buildReport(park, current, config)
  process.stdout.write(renderReport(report, tr, cwd()))
  process.exit(0)
}

async function cmdRun(cmd: string[]): Promise<void> {
  const [bin, ...args] = cmd
  if (!bin) {
    console.error('lastgood run: no command given (e.g. lastgood run -- npm test)')
    process.exit(2)
  }
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const result = await execa(bin, args, { cwd: cwd(), stdio: 'inherit', reject: false })
  const config = resolveConfig(cwd())
  if (result.exitCode === 0 && config.runOnSuccess) {
    await mark(cwd(), config, {
      trigger: 'auto-success',
      success: { command: cmd.join(' '), exitCode: 0, ranAt: startedAt, durationMs: Date.now() - started },
    })
    console.log('\nlastgood: success — saved this as your last-good state.')
  }
  process.exit(result.exitCode ?? 0)
}

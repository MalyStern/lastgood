// Terminal report for `lastgood diff` / `morning`. Severity as icon AND word (never
// colour alone). Ends with a copy-paste "run these to get going" block built from
// the fixes, in order.

import pc from 'picocolors'
import type { ChangeReport, Finding, Severity } from '../types.js'
import type { Translator } from '../i18n.js'

const ICON: Record<Severity, string> = { blocking: '✖', likely: '▲', nice: '•', info: '·' }

function paint(sev: Severity, s: string): string {
  switch (sev) {
    case 'blocking': return pc.red(s)
    case 'likely': return pc.yellow(s)
    case 'nice': return pc.cyan(s)
    case 'info': return pc.dim(s)
  }
}
function sevWord(sev: Severity, tr: Translator['t']): string {
  return tr(sev === 'blocking' ? 'sevBlocking' : sev === 'likely' ? 'sevLikely' : sev === 'nice' ? 'sevNice' : 'sevInfo')
}

function renderFinding(f: Finding, tr: Translator): string[] {
  const out: string[] = [`  ${paint(f.severity, `${ICON[f.severity]} ${sevWord(f.severity, tr.t)}`)}  ${f.title}`]
  if (f.detail) out.push(pc.dim(`      ${f.detail}`))
  if (f.fix) {
    out.push(`      ${pc.dim(tr.t('fix') + ':')} ${f.fix.title}`)
    if (f.fix.command) out.push(`      ${pc.dim(tr.t('run') + ':')} ${pc.bold(f.fix.command)}`)
  }
  return out
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { blocking: 0, likely: 0, nice: 0, info: 0 }
  for (const f of findings) c[f.severity]++
  return c
}

export function renderReport(report: ChangeReport, tr: Translator, projectPath: string): string {
  const when = new Date(report.lastGoodAt).toLocaleString()
  const out: string[] = [
    '',
    pc.bold(tr.t('reportTitle')),
    pc.dim(`${tr.t('lastWorked')}: ${when} (${report.lastGoodTrigger}) · ${projectPath}`),
    '',
  ]

  if (report.findings.length === 0) {
    out.push(`  ${pc.green('✓')} ${tr.t('clean')}`, '')
    return out.join('\n')
  }

  for (const sev of ['blocking', 'likely', 'nice', 'info'] as Severity[]) {
    for (const f of report.findings.filter((x) => x.severity === sev)) {
      out.push(...renderFinding(f, tr))
      out.push('')
    }
  }

  const c = countBySeverity(report.findings)
  out.push(pc.dim('─'.repeat(48)))
  out.push(tr.t('summary', { b: c.blocking, l: c.likely, n: c.nice }))
  out.push(c.blocking ? pc.red(tr.t('hasBlocking')) : c.likely ? pc.yellow(tr.t('hasLikely')) : pc.green(tr.t('readyRun')))

  const cmds = [...new Set(
    report.findings
      .filter((f) => f.severity === 'blocking' || f.severity === 'likely')
      .map((f) => f.fix?.command)
      .filter((x): x is string => !!x && !x.startsWith('http')),
  )]
  if (cmds.length) {
    out.push('', pc.bold(tr.t('runThis')))
    for (const cmd of cmds) out.push(pc.green(`  ${cmd}`))
  }
  out.push('')
  return out.join('\n')
}

// Markdown report for `lastgood diff --report`. Prioritised, diff-friendly.

import type { ChangeReport, Finding, Severity } from '../types.js'
import { countBySeverity } from './tty.js'

const HEAD: Record<Severity, string> = {
  blocking: '🔴 Blocking',
  likely: '🟡 Likely',
  nice: '🔵 Nice to know',
  info: 'ℹ️ Info',
}

export function renderMarkdown(report: ChangeReport, projectPath: string): string {
  const out: string[] = [
    '# LastGood report',
    '',
    `_Project: \`${projectPath}\` · last worked: ${report.lastGoodAt} (${report.lastGoodTrigger})_`,
    '',
  ]
  if (report.findings.length === 0) {
    out.push('✅ Nothing changed since your project last worked.', '')
    return out.join('\n')
  }
  const c = countBySeverity(report.findings)
  out.push(`**${c.blocking} blocking · ${c.likely} likely · ${c.nice} nice to know**`, '')

  for (const sev of ['blocking', 'likely', 'nice', 'info'] as Severity[]) {
    const items = report.findings.filter((f) => f.severity === sev)
    if (!items.length) continue
    out.push(`## ${HEAD[sev]}`, '')
    for (const f of items) out.push(...findingMd(f))
  }

  const cmds = [...new Set(
    report.findings
      .filter((f) => f.severity === 'blocking' || f.severity === 'likely')
      .map((f) => f.fix?.command)
      .filter((x): x is string => !!x && !x.startsWith('http')),
  )]
  if (cmds.length) out.push('## Run these to get going', '', '```bash', ...cmds, '```', '')
  return out.join('\n')
}

function findingMd(f: Finding): string[] {
  const out = [`### ${f.title}`]
  if (f.detail) out.push('', f.detail)
  if (f.fix) {
    out.push('', `**Fix:** ${f.fix.title}`)
    if (f.fix.command) out.push('', '```bash', f.fix.command, '```')
  }
  out.push('')
  return out
}

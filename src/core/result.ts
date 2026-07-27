// Shared severity ranking + exit-code policy for change reports.

import type { Finding, Severity } from './types.js'

const RANK: Record<Severity, number> = { info: 0, nice: 1, likely: 2, blocking: 3 }

export function worstOf(findings: Finding[]): Severity | null {
  let worst: Severity | null = null
  for (const f of findings) if (worst === null || RANK[f.severity] > RANK[worst]) worst = f.severity
  return worst
}

export function exitCodeFor(worst: Severity | null, failOn: Exclude<Severity, 'info'>): number {
  if (worst === null) return 0
  if (worst === 'blocking') return 2
  return RANK[worst] >= RANK[failOn] ? 1 : 0
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { blocking: 0, likely: 0, nice: 0, info: 0 }
  for (const f of findings) c[f.severity]++
  return c
}

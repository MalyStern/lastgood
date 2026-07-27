// Public API. Thin orchestration over the engine — capture a fingerprint, load the
// last-good one, compute the change report. Data only; no printing, no exit.

import { captureFingerprint, type CaptureOptions } from './engine/capture.js'
import { loadConfig } from './core/config.js'
import { diffFingerprints } from './core/diff.js'
import { exitCodeFor, worstOf } from './core/result.js'
import { readFingerprint, writeFingerprint } from './core/store.js'
import type { ChangeReport, Fingerprint, ResolvedConfig } from './core/types.js'

export function resolveConfig(root: string, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return loadConfig(root, overrides)
}

export async function captureCurrent(
  root: string,
  config: ResolvedConfig,
  opts: CaptureOptions,
  signal?: AbortSignal,
): Promise<Fingerprint> {
  return captureFingerprint(root, config, opts, signal)
}

/** Capture the current state and persist it as the new last-good. */
export async function mark(
  root: string,
  config: ResolvedConfig,
  opts: CaptureOptions,
  signal?: AbortSignal,
): Promise<Fingerprint> {
  const fp = await captureFingerprint(root, config, opts, signal)
  writeFingerprint(root, fp)
  return fp
}

/** Build a change report from a baseline fingerprint and the current state. */
export function buildReport(
  baseline: Fingerprint,
  current: Fingerprint,
  config: ResolvedConfig,
): ChangeReport {
  const findings = diffFingerprints(baseline, current)
  const worst = worstOf(findings)
  return {
    lastGoodAt: baseline.createdAt,
    lastGoodTrigger: baseline.trigger,
    findings,
    worst,
    exitCode: exitCodeFor(worst, config.failOn),
  }
}

export { readFingerprint, writeFingerprint }
export { diffFingerprints } from './core/diff.js'
export { generateContext } from './core/context.js'
export type { Fingerprint, ChangeReport, Finding, Severity, ResolvedConfig } from './core/types.js'
export { SCHEMA_VERSION } from './core/types.js'

// Install/uninstall git hooks that *nudge* — and only nudge. After a `git pull`
// (post-merge) or a branch switch (post-checkout) they print a single line telling
// you to run `lastgood morning`. They NEVER run a fix, never touch your database,
// never change anything: LastGood's whole point is that you (or your agent) draw the
// conclusion, so the hook stops at the reminder.
//
// We mirror PatchProof's safe hook approach: our block is wrapped in sentinel markers
// and appended to any hook you already have — so we never clobber a Husky/lefthook
// script, and `uninstall-hooks` removes only our own block.
//
// The string work (build the block, inject it, strip it) is pure and unit-tested; the
// thin functions at the bottom do the filesystem + git I/O.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execa } from 'execa'

export const HOOK_START = '# >>> lastgood >>>'
export const HOOK_END = '# <<< lastgood <<<'

export type LastGoodHook = 'post-merge' | 'post-checkout'
export const LASTGOOD_HOOKS: LastGoodHook[] = ['post-merge', 'post-checkout']

/** Build the sentinel-wrapped shell block for one hook. Pure. */
export function buildHookBlock(hook: LastGoodHook): string {
  // post-checkout also fires on a *file* checkout (`git checkout -- file`); its 3rd
  // arg is 1 only for a branch switch, so we stay quiet otherwise.
  const guard =
    hook === 'post-checkout'
      ? '# Only nudge on a branch switch (3rd arg == 1), not a file checkout.\n[ "$3" = "1" ] || exit 0\n'
      : ''
  return `${HOOK_START}
# Reminds you to check what changed since your project last worked (${hook}).
# It prints ONE line and never runs a fix or changes anything. Remove: lastgood uninstall-hooks
${guard}# Stay silent until you've saved a good state at least once (lastgood mark).
[ -f .lastgood/fingerprint.json ] || exit 0
echo "lastgood: state may have changed - run 'lastgood morning' to see what drifted since it last worked."
exit 0
${HOOK_END}`
}

/** True if our block is already present in the hook file's content. Pure. */
export function hasHookBlock(content: string): boolean {
  return content.includes(HOOK_START)
}

/**
 * Append our block to an existing hook's content without clobbering it. Idempotent —
 * returns the content unchanged if our block is already there. Pure.
 */
export function injectHookBlock(existing: string, block: string): string {
  if (hasHookBlock(existing)) return existing
  if (!existing.trim()) return `#!/bin/sh\n${block}\n`
  const base = existing.endsWith('\n') ? existing : existing + '\n'
  return `${base}\n${block}\n`
}

/** Remove only our block, leaving any surrounding hook script intact. Pure. */
export function stripHookBlock(existing: string): string {
  if (!hasHookBlock(existing)) return existing
  const stripped = existing
    .replace(new RegExp(`\\n*${escapeRe(HOOK_START)}[\\s\\S]*?${escapeRe(HOOK_END)}\\n*`), '\n')
    .replace(/\n{3,}/g, '\n\n')
  return stripped.trimEnd() + '\n'
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// --- filesystem + git I/O (kept thin; the logic above is what's tested) ---

async function hooksDir(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--git-path', 'hooks'], { cwd })
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd })
  return join(root.trim(), stdout.trim())
}

export async function installHooks(cwd: string): Promise<string> {
  const dir = await hooksDir(cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const lines: string[] = []
  for (const hook of LASTGOOD_HOOKS) {
    const p = join(dir, hook)
    const existing = existsSync(p) ? readFileSync(p, 'utf8') : ''
    if (hasHookBlock(existing)) {
      lines.push(`${hook}: already installed`)
      continue
    }
    writeFileSync(p, injectHookBlock(existing, buildHookBlock(hook)), 'utf8')
    try {
      chmodSync(p, 0o755)
    } catch {
      /* chmod may be a no-op on Windows — git still runs the hook via sh */
    }
    lines.push(`${hook}: installed`)
  }
  return `LastGood hooks in ${dir}\n  ${lines.join('\n  ')}\n\nThey only remind you to run \`lastgood morning\`; they never run a fix.`
}

export async function uninstallHooks(cwd: string): Promise<string> {
  const dir = await hooksDir(cwd)
  const lines: string[] = []
  for (const hook of LASTGOOD_HOOKS) {
    const p = join(dir, hook)
    if (!existsSync(p)) {
      lines.push(`${hook}: none`)
      continue
    }
    const content = readFileSync(p, 'utf8')
    if (!hasHookBlock(content)) {
      lines.push(`${hook}: no LastGood block`)
      continue
    }
    writeFileSync(p, stripHookBlock(content), 'utf8')
    lines.push(`${hook}: removed`)
  }
  return `Removed LastGood hooks from ${dir}\n  ${lines.join('\n  ')}`
}

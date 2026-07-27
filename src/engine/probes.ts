// Probes actually touch the system: they spawn a process or open a socket. Each is
// time-boxed and cancellable so a hung Docker socket or a slow interpreter never
// hangs the CLI. Every probe returns facts, never verdicts.

import { execa } from 'execa'
import net from 'node:net'
import type { Runtime } from '../core/types.js'

export interface RuntimeProbe {
  installed: boolean
  version: string | null
  raw?: string
}

// How to ask each runtime for its version. NOTE the stream quirks:
//  - `java -version` prints to STDERR (all JDKs) — we read combined output.
//  - Python <3.4 printed to stderr; 3.4+ to stdout — combined output covers both.
// Everything else prints to stdout. We read `all` (stdout+stderr) to be safe.
const VERSION_CMD: Record<Runtime, { cmd: string; args: string[] }[]> = {
  node: [{ cmd: 'node', args: ['--version'] }],
  python: [
    { cmd: 'python3', args: ['--version'] },
    { cmd: 'python', args: ['--version'] },
  ],
  java: [{ cmd: 'java', args: ['-version'] }],
  dotnet: [{ cmd: 'dotnet', args: ['--version'] }],
  go: [{ cmd: 'go', args: ['version'] }],
  ruby: [{ cmd: 'ruby', args: ['--version'] }],
}

/** Extract the first semver-ish number from a version banner. */
export function extractVersion(raw: string): string | null {
  const m = raw.match(/(\d+\.\d+(?:\.\d+)?)/)
  return m ? m[1]! : null
}

export async function probeRuntime(runtime: Runtime, signal?: AbortSignal): Promise<RuntimeProbe> {
  for (const { cmd, args } of VERSION_CMD[runtime]) {
    try {
      const r = await execa(cmd, args, { reject: false, all: true, timeout: 8000, cancelSignal: signal })
      const out = (r.all ?? `${r.stdout}\n${r.stderr}`).trim()
      const version = extractVersion(out)
      if (version) return { installed: true, version, raw: out.split(/\r?\n/)[0] }
      // spawned but couldn't parse — still counts as installed
      return { installed: true, version: null, raw: out.split(/\r?\n/)[0] }
    } catch (e) {
      if (isNotFound(e)) continue // try the next candidate command
      // Some other failure (timeout, etc.) — report as not-usable.
      return { installed: false, version: null }
    }
  }
  return { installed: false, version: null }
}

const isNotFound = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'ENOENT'

// --- Ports ---

function tryBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', (err: NodeJS.ErrnoException) => {
      // In use if the address is taken; any other error -> can't prove taken, call it free.
      resolve(err.code === 'EADDRINUSE' ? false : true)
    })
    srv.once('listening', () => srv.close(() => resolve(true)))
    try {
      srv.listen(port, host)
    } catch {
      resolve(true)
    }
  })
}

/** True if the port is occupied on any of the hosts we'd realistically serve on. */
export async function isPortInUse(port: number): Promise<boolean> {
  for (const host of ['0.0.0.0', '127.0.0.1']) {
    const free = await tryBind(port, host)
    if (!free) return true
  }
  return false
}

// --- Docker ---

export interface DockerStatus {
  installed: boolean
  daemonRunning: boolean
}

export async function probeDocker(signal?: AbortSignal): Promise<DockerStatus> {
  try {
    // Exit code is the fact: `docker info` returns 0 only if the daemon responds.
    const r = await execa('docker', ['info'], { reject: false, timeout: 6000, cancelSignal: signal })
    return { installed: true, daemonRunning: r.exitCode === 0 }
  } catch (e) {
    if (isNotFound(e)) return { installed: false, daemonRunning: false }
    return { installed: true, daemonRunning: false }
  }
}

export interface ComposeService {
  service: string
  state: string
  health?: string
  exitCode?: number
}

/** Parse `docker compose ps --format json` — tolerant of JSON-lines OR a JSON array. */
export function parseComposePs(stdout: string): ComposeService[] {
  const text = stdout.trim()
  if (!text) return []
  const rows: unknown[] = []
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text)
      if (Array.isArray(arr)) rows.push(...arr)
    } catch {
      /* fall through */
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      try {
        rows.push(JSON.parse(t))
      } catch {
        /* skip a non-JSON line */
      }
    }
  }
  return rows.map((r) => {
    const o = r as Record<string, unknown>
    return {
      service: String(o.Service ?? o.Name ?? ''),
      state: String(o.State ?? ''),
      health: o.Health ? String(o.Health) : undefined,
      exitCode: typeof o.ExitCode === 'number' ? o.ExitCode : undefined,
    }
  })
}

export async function composePs(composeFile: string, cwd: string, signal?: AbortSignal): Promise<ComposeService[]> {
  const r = await execa('docker', ['compose', '-f', composeFile, 'ps', '--format', 'json'], {
    cwd,
    reject: false,
    timeout: 8000,
    cancelSignal: signal,
  })
  if (r.exitCode !== 0) return []
  return parseComposePs(r.stdout)
}

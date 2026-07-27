# Security Policy

LastGood is local-first and privacy-preserving by design, but it reads your project and runs commands in it, so we take its behaviour seriously.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private vulnerability reporting:

- Go to the repo's **Security** tab → **Report a vulnerability**.

Include what you found, how to reproduce it, and the impact. We'll acknowledge within a few days and keep you updated through to a fix and disclosure.

## The guarantees in scope

- **Env values are never read.** LastGood records env-var **key names** only. If you can make it read, store, or print a value from a `.env`, that's a serious bug — report it.
- **No network, ever.** LastGood makes no network requests and has no telemetry. Any outbound connection is in scope.
- **Database is never touched.** Migrations are counted on disk. Anything that connects to or mutates a database is in scope.
- **Command execution.** Probes spawn read-only commands (`node --version`, `docker info`, …) with `shell: false` and argument arrays. A path to arbitrary or non-read-only execution is in scope. (`lastgood run -- <cmd>` intentionally runs the command you give it — that's the feature, not a vulnerability.)
- **Local state stays local.** The `.lastgood/` fingerprint is gitignored and never leaves the machine. Anything that leaks it is in scope.

## What isn't a vulnerability

- A misdiagnosis or missed change — report it as a normal issue so we can improve accuracy.
- `lastgood run` executing the command you explicitly passed it.

# Contributing to LastGood

Thanks for helping. LastGood is trustworthy only because it states facts, not guesses — please keep that bar.

## Getting set up

```bash
git clone https://github.com/MalyStern/lastgood
cd lastgood
npm install
npm test          # vitest unit tests
npm run typecheck # tsc --noEmit
npm run build     # bundle to bin/lastgood.mjs
npm run dev -- mark
```

## The rules that keep it trustworthy

1. **Detect facts, never guess.** A change item states what was observed — *"a migration was added and isn't applied locally"* — never a cause. The developer or their AI concludes.
2. **Never read secret values.** The env detector reads key **names** only. There is deliberately no code path that opens a `.env` for its values; keep it that way.
3. **Never touch a database or the network.** Migrations are counted on disk. Everything is local. No telemetry, ever.
4. **Read-only probes only, time-boxed.** If a detector spawns a process, it must be a read-only command, cancellable via `ctx.signal`.

## Where things live

- `src/engine/capture.ts` — builds a Fingerprint (pure reads + `probes.ts` for versions).
- `src/core/diff.ts` — the pure diff engine (two fingerprints → findings). **This is the most important file and the easiest to test** — add cases here.
- `src/core/store.ts` — `.lastgood/` I/O.
- `src/core/context.ts` — the AI `verified-context.md` generator.
- `src/core/main.ts` — the Commander commands.

## Adding a detector

1. Capture its fact in `captureFingerprint` (bump `SCHEMA_VERSION` if the fingerprint shape changes).
2. Compare it in `diffFingerprints`, emitting a `Finding` with a concrete `fix`.
3. Add unit tests to `test/unit.test.ts` for the diff logic — the change case, the no-change case, and the false-positive you avoid.

## Adding a UI language

`src/core/i18n.ts` — add your code with the same keys. Finding text stays English (it's what people paste into a search box or an AI). English fallback is per-key.

## Before opening a PR

- `npm run typecheck && npm test && npm run build` all green
- New behaviour has a test
- Try it on a real repo: `mark`, change something, `diff`

Open an issue first for anything large. Small, focused PRs merge fastest.

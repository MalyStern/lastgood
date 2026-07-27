# LastGood — launch kit

Ready-to-post copy. **You** post these from your own accounts — nothing here is auto-posted. Post the npm-install line only *after* you've published to npm.

## Before you post
- [ ] Publish to npm so `npx lastgood` works (add `NPM_TOKEN`; Release workflow handles the rest).
- [ ] Record the killer demo (this one demos itself in 15s): project works → `lastgood mark` → `git pull` → `lastgood morning` shows the lockfile/migration/env changes → run the fixes → it works. GIF at the top of the README.

## Show HN
**Title:** `Show HN: LastGood – find what changed since your project last worked`

**Body:**
> The "it worked yesterday" problem: the project ran fine on Friday, you `git pull` on Monday, and it's broken. The fix is usually small — reinstall, run one migration, add an env var — but finding *which* one eats half an hour of you and your AI assistant guessing.
>
> LastGood removes the guessing. When the project works you save a snapshot (`lastgood mark`, or automatically when your tests pass). Later, `lastgood morning` compares now against that snapshot and tells you exactly what drifted — dependencies, migrations, env vars, runtime, services — ranked, each with a fix.
>
> It's local-first: the snapshot lives in `.lastgood/` (gitignored), it never reads secret values (only env-var key names), never touches your database (migrations are counted on disk), and makes no network calls.
>
> Bonus: `lastgood context` writes a facts-only `verified-context.md` your AI coding agent can read instead of hallucinating.
>
> `npx lastgood`. 20 languages, MIT. Guiding rule: detect facts, never guess.

## Reddit
- **r/programming, r/node, r/webdev** — title: *"I built a local CLI for the 'it worked yesterday' problem — npx lastgood"*. The framing is instantly relatable; lead with the demo GIF.
- **r/ExperiencedDevs** — the AI-verified-context angle (giving agents facts, not a code dump) resonates there.

## X / Bluesky
> "It worked yesterday. I pulled. Now it doesn't." `npx lastgood` remembers your last known-good state and tells you exactly what changed since — deps, migrations, env vars, runtime — with the commands to fix it. Local, nothing uploaded. MIT. [link] [demo]

## Lists
- awesome-nodejs, awesome-cli-apps, awesome-devtools, awesome-developer-experience

## Honest positioning
No tool combines all four things LastGood does (last-good snapshot + diff-since + prep-to-run + verified AI context) — the closest is DevCat, which lacks the prep-to-run and uses a raw code dump rather than verified facts. You can say the gap is real, but stay accurate and credit neighbours (git-pull-run, envdrift, Nix/devcontainers) rather than claiming "the only tool".

// The starter lastgood.yml that `lastgood init` writes.
//
// Kept in its own module so a test can assert the loader accepts it. A tool whose
// own init output its own config loader then rejects is the worst first impression
// available, and it is exactly what happens if this file and the validator drift.

export const EXAMPLE_YML = `# lastgood.yml — commit this. Machine state lives in .lastgood/ (gitignored).
version: 1

# The single source of truth for "the project works": exit 0 => auto-mark.
# success_command: "npm test"
run_on_success: true

privacy:
  store_env_values: false   # HARD DEFAULT — values are never read, regardless
  cloud_sync: false         # local-only; no network calls, ever

detectors:
  git: { enabled: true }
  lockfiles: { enabled: true }
  runtimes: { enabled: true }
  env_schema: { enabled: true }
  docker: { enabled: true }
  ports: { enabled: true }
  migrations: { enabled: true, tools: [prisma, drizzle] }
  schema: { enabled: true, hash: ["prisma/schema.prisma", "src/db/schema.ts"] }

watch_paths: []
ignore: ["**/*.log", "tmp/**"]

diff:
  fail_on: blocking
`


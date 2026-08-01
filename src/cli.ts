// Entry point. Set colour env from argv BEFORE importing anything that reads it
// (picocolors decides colour support at import time), then hand off to the program.

if (process.argv.includes('--no-color') || 'NO_COLOR' in process.env) {
  process.env.NO_COLOR = '1'
}

const { main } = await import('./core/main.js')

try {
  await main(process.argv)
} catch (e) {
  // A settings problem is a sentence the user can act on. A stack trace aimed at
  // someone who mistyped a key in a YAML file tells them nothing, and reads as a
  // crash in the tool rather than a typo in their file.
  if (e instanceof Error && e.name === 'ConfigError') {
    console.error(`lastgood: ${e.message}`)
    process.exit(3)
  }
  throw e
}

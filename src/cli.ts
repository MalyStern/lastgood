// Entry point. Set colour env from argv BEFORE importing anything that reads it
// (picocolors decides colour support at import time), then hand off to the program.

if (process.argv.includes('--no-color') || 'NO_COLOR' in process.env) {
  process.env.NO_COLOR = '1'
}

const { main } = await import('./core/main.js')
await main(process.argv)

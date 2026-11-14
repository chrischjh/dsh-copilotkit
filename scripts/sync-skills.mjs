// Re-vendor the official CopilotKit agent skills into skills/ and rewrite
// skills.lock.json. Default vendors the two core skills the bundle registers;
// pass --all to vendor every skill directory from upstream's skills/.
//
//   node scripts/sync-skills.mjs [--all]

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const UPSTREAM = 'https://github.com/CopilotKit/CopilotKit.git'
const CORE_SKILLS = ['copilotkit', 'copilotkit-cli']

const wantAll = process.argv.includes('--all')
const selected = wantAll ? undefined : CORE_SKILLS

const work = mkdtempSync(join(tmpdir(), 'dsh-copilotkit-sync-'))
try {
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', UPSTREAM, work], { stdio: 'inherit' })
  execFileSync('git', ['sparse-checkout', 'set', 'skills'], { cwd: work, stdio: 'inherit' })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, encoding: 'utf8' }).trim()

  const sourceRoot = join(work, 'skills')
  if (!existsSync(sourceRoot)) throw new Error('upstream checkout has no skills/ directory')
  const available = readdirSync(sourceRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  const picked = selected === undefined ? available : selected.filter(name => available.includes(name))
  const missing = selected === undefined ? [] : selected.filter(name => !available.includes(name))

  const lock = {
    source: 'https://github.com/CopilotKit/CopilotKit/tree/main/skills',
    upstreamCommit: commit,
    syncedAt: new Date().toISOString(),
    files: {},
  }
  for (const name of picked) {
    const target = join(ROOT, 'skills', name)
    rmSync(target, { recursive: true, force: true })
    cpSync(join(sourceRoot, name), target, { recursive: true })
    for (const file of collectFiles(target)) {
      const relativeKey = relative(ROOT, file).split(sep).join('/')
      lock.files[relativeKey] = { sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }
    }
  }
  writeFileSync(join(ROOT, 'skills.lock.json'), JSON.stringify(lock, null, 2) + '\n')

  console.log(`vendored ${picked.length} skill(s) from ${UPSTREAM}@${commit.slice(0, 12)}`)
  console.log(`files locked: ${Object.keys(lock.files).length}`)
  if (missing.length > 0) {
    console.warn(`upstream no longer has: ${missing.join(', ')} — remove them from CORE_SKILLS in scripts/sync-skills.mjs`)
    process.exitCode = 1
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

function collectFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

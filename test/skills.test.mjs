import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUNDLED_SKILL_NAMES,
  MCP_TOOLS,
  addendumFor,
  discoverSkills,
  readSkill,
  registerSkillsEffect,
  registrationFor,
} from '../lib/skills.js'
import { SECTION_NAME, SECTION_ORDER, SECTION_TEXT } from '../lib/prompt.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILLS_ROOT = join(ROOT, 'skills')

test('discoverSkills finds the two official core skills', () => {
  const skills = discoverSkills(SKILLS_ROOT)
  assert.deepEqual(skills.map(skill => skill.name), ['copilotkit', 'copilotkit-cli'])
  for (const skill of skills) {
    assert.ok(skill.description.length > 20, `${skill.name} has a real description`)
    assert.ok(skill.body.includes('# '), `${skill.name} has a body`)
    assert.match(skill.description, /CopilotKit/i)
  }
})

test('each registered skill carries the DSH addendum with exact tool names', () => {
  const skills = discoverSkills(SKILLS_ROOT)
  for (const skill of skills) {
    const registration = registrationFor(skill)
    assert.equal(registration.name, skill.name)
    assert.equal(registration.source, 'bundled')
    assert.equal(registration.provider, 'copilotkit')
    assert.equal(registration.resourceBase.kind, 'directory')
    assert.equal(registration.resourceBase.path, join(SKILLS_ROOT, skill.name))
    assert.ok(registration.content.includes('## In DeepSeek Harness'), `${skill.name} carries the addendum`)
    for (const tool of ['search-docs', 'search-code']) {
      assert.ok(registration.content.includes(`mcp__copilotkit__${tool}`), `${skill.name} names ${tool}`)
    }
    // The vendored upstream body stays first and verbatim: the addendum is appended only.
    assert.ok(registration.content.startsWith(skill.body.trimEnd()))
    assert.equal(registration.metadata.upstream, 'CopilotKit/CopilotKit skills')
  }
})

test('the CLI skill addendum keeps verify-first; the docs skill keeps the Markdown fallback', () => {
  const byName = Object.fromEntries(discoverSkills(SKILLS_ROOT).map(skill => [skill.name, skill]))
  assert.match(addendumFor(byName['copilotkit-cli']), /verify/)
  assert.match(addendumFor(byName['copilotkit']), /docs\.copilotkit\.ai/)
  for (const name of BUNDLED_SKILL_NAMES) assert.ok(byName[name])
})

test('the do-not-hand-roll rule is present in every skill addendum', () => {
  for (const skill of discoverSkills(SKILLS_ROOT)) {
    assert.match(addendumFor(skill), /Do not hand-roll/)
  }
})

test('skills.lock.json matches the vendored bytes', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'skills.lock.json'), 'utf8'))
  assert.match(lock.upstreamCommit, /^[0-9a-f]{40}$/)
  const entries = Object.entries(lock.files)
  assert.ok(entries.length >= 2)
  for (const [relative, recorded] of entries) {
    const bytes = readFileSync(join(ROOT, relative))
    assert.ok(!bytes.includes(Buffer.from('\r\n')), `${relative} has CRLF line endings; .gitattributes must keep the vendored copy at LF`)
    const actual = createHash('sha256').update(bytes).digest('hex')
    assert.equal(actual, recorded.sha256, `${relative} drifted from skills.lock.json; run pnpm run sync`)
  }
})

test('prompt section is self-scoped, short, and brace-free', () => {
  assert.ok(!SECTION_TEXT.includes('{{'))
  assert.match(SECTION_TEXT, /copilotkit/)
  assert.match(SECTION_TEXT, /mcp__copilotkit__/)
  assert.match(SECTION_TEXT, /copilotkit-cli/)
  assert.match(SECTION_TEXT, /verify/)
  assert.match(SECTION_TEXT, /docs\.copilotkit\.ai\/<path>\.md/)
  assert.ok(SECTION_TEXT.length < 1200)
  assert.equal(SECTION_NAME, 'copilotkit:workflow')
  assert.equal(SECTION_ORDER, 3101)
})

test('MCP tool roster matches the CopilotKit docs server', () => {
  assert.deepEqual(MCP_TOOLS, [
    'search-docs',
    'search-code',
    'search-ag-ui-docs',
    'search-ag-ui-code',
    'explore-docs',
    'explore-code',
    'submit-feedback',
  ])
})

test('registerSkillsEffect registers every discovered skill and cleans up', () => {
  const registered = []
  const effects = []
  const warnings = []
  const ctx = {
    logger: { warn: (message) => warnings.push(message) },
    get(key) { return key === 'skills' ? { register: (skill) => { registered.push(skill); return () => {} } } : undefined },
    effect(factory, label) { effects.push({ factory, label }); return factory() },
  }
  const effect = registerSkillsEffect(ctx, {}, (message) => warnings.push(message))
  assert.equal(typeof effect, 'function')
  assert.ok(effects.length === 0) // caller owns ctx.effect
  effect()
  assert.equal(registered.length, 2)
  assert.deepEqual(registered.map(skill => skill.name).sort(), ['copilotkit', 'copilotkit-cli'])
  assert.ok(effects.length === 0) // caller owns ctx.effect
})

test('registerSkillsEffect honors a skills allowlist and a missing service', () => {
  const ctx = {
    logger: { warn: () => {} },
    get() { return undefined },
    effect() {},
  }
  assert.equal(registerSkillsEffect(ctx, {}), undefined)

  const registered = []
  const ctx2 = {
    logger: { warn: () => {} },
    get(key) { return key === 'skills' ? { register: (skill) => { registered.push(skill); return () => {} } } : undefined },
    effect() {},
  }
  registerSkillsEffect(ctx2, { skills: ['copilotkit'] }, () => {})()
  assert.deepEqual(registered.map(skill => skill.name), ['copilotkit'])
})

test('readSkill parses vendored frontmatter and rejects missing directories', () => {
  const skill = readSkill(join(SKILLS_ROOT, 'copilotkit'))
  assert.ok(skill !== undefined)
  assert.equal(skill.name, 'copilotkit')
  assert.ok(skill.description.length > 0)
  assert.equal(readSkill(join(SKILLS_ROOT, 'does-not-exist')), undefined)
})

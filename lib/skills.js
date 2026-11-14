// Skill loading for the dsh-copilotkit bundle.
//
// Reads the vendored, verbatim copies of the official CopilotKit agent skills
// (skills/<name>/SKILL.md, pinned by skills.lock.json), parses their YAML
// frontmatter, and returns runtime skill registrations for ctx.skills. The
// vendored files stay byte-identical to upstream so the sync script can verify
// them; the DeepSeek Harness specific guidance is appended at registration
// time only.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Skills bundled with this plugin, in catalog order. */
export const BUNDLED_SKILL_NAMES = ['copilotkit', 'copilotkit-cli']

/** MCP tool names exposed by the configured `copilotkit` MCP server. */
export const MCP_TOOLS = [
  'search-docs',
  'search-code',
  'search-ag-ui-docs',
  'search-ag-ui-code',
  'explore-docs',
  'explore-code',
  'submit-feedback',
]

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Minimal YAML frontmatter reader for the fields these skills use. */
function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER)
  if (match === null) return undefined
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (entry === null) continue
    let value = entry[2].trim()
    const quoted = value.match(/^(["'])([\s\S]*)\1$/)
    if (quoted !== null) value = quoted[2]
    fields[entry[1]] = value
  }
  return fields
}

/** Read one vendored skill directory into a registration input. */
export function readSkill(dir) {
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) return undefined
  const raw = readFileSync(file, 'utf8')
  const fields = parseFrontmatter(raw)
  if (fields === undefined) return undefined
  const { name, description } = fields
  if (typeof name !== 'string' || name === '' || typeof description !== 'string' || description === '') {
    return undefined
  }
  const body = raw.slice(raw.match(FRONTMATTER)[0].length)
  return {
    name,
    description,
    version: fields.version,
    path: file,
    dir,
    body,
  }
}

/** Discover every readable vendored skill under `root`, sorted by name. */
export function discoverSkills(root, log = () => {}) {
  if (!existsSync(root)) {
    log(`skill root "${root}" does not exist; no CopilotKit skills registered`)
    return []
  }
  const skills = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const skill = readSkill(dir)
    if (skill === undefined) {
      log(`skill directory "${dir}" ignored: missing or invalid SKILL.md frontmatter`)
      continue
    }
    skills.push(skill)
  }
  return skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * DeepSeek Harness specific addendum appended to each skill body at
 * registration. Keeps the vendored upstream text verbatim on disk while
 * teaching the exact DSH tool names and the do-not-reinvent rule.
 */
export function addendumFor(skill) {
  const toolLine = `The \`copilotkit\` MCP server is configured by this bundle. Its tools are: ${MCP_TOOLS.map(name => `\`mcp__copilotkit__${name}\``).join(', ')}.`
  const lines = [
    '',
    '---',
    '',
    '## In DeepSeek Harness (dsh-copilotkit bundle)',
    '',
    `- ${toolLine}`,
    skill.name === 'copilotkit-cli'
      ? '- The CLI commands above run unchanged. `verify` stays the first debugging step before reading the project by hand.'
      : '- If the MCP tools are absent (for example the docs server is offline), fall back to fetching `https://docs.copilotkit.ai/<path>.md` as this skill describes.',
    '- Do not hand-roll a substitute for an existing CopilotKit primitive (chat UI, hooks, frontend tools, shared state, human-in-the-loop, runtime, AG-UI streams) and do not patch CopilotKit library internals to force behavior. When the current docs and source do not support what you need, build on the closest official primitive and tell the user what is missing.',
    '- These skill files are vendored and pinned in the bundle\'s skills.lock.json; do not refresh them with git commands in this skill\'s directory and do not update them by hand — updates ship with the bundle through its sync script.',
  ]
  return lines.join('\n') + '\n'
}

/** Registration input for one skill as ctx.skills.register expects it. */
export function registrationFor(skill) {
  return {
    name: skill.name,
    description: skill.description,
    content: skill.body.trimEnd() + addendumFor(skill),
    source: 'bundled',
    provider: 'copilotkit',
    path: skill.path,
    resourceBase: { kind: 'directory', path: skill.dir },
    metadata: {
      upstream: 'CopilotKit/CopilotKit skills',
      ...skill.version !== undefined ? { upstreamVersion: skill.version } : {},
    },
  }
}

/**
 * Register the bundled CopilotKit skills on ctx.skills.
 * @returns the effect factory to hand to ctx.effect, or undefined.
 */
export function registerSkillsEffect(ctx, config, log = () => {}) {
  const skills = ctx.get('skills')
  if (skills === undefined || typeof skills.register !== 'function') return undefined
  const root = config.skillsDir !== undefined
    ? (isAbsolute(config.skillsDir) ? config.skillsDir : resolve(config.skillsDir))
    : join(fileURLToPath(new URL('..', import.meta.url)), 'skills')
  const selected = typeof config.skills === 'object' && config.skills !== null
    ? discoverSkills(root, log).filter(skill => config.skills.includes(skill.name))
    : discoverSkills(root, log)
  return () => selected.map(skill => skills.register(registrationFor(skill)))
}

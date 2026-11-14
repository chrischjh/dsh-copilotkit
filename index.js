/**
 * dsh-copilotkit: DeepSeek Harness bundle that equips every agent with the
 * official CopilotKit developer kit:
 *
 * 1. The two core CopilotKit agent skills (`copilotkit`, `copilotkit-cli`),
 *    vendored verbatim from CopilotKit/CopilotKit and pinned by skills.lock.json,
 *    registered on ctx.skills so they appear in the session skill catalog and
 *    load through the `skill` tool.
 * 2. A short system-prompt section that points CopilotKit work at the skill and
 *    the docs MCP tools before any code is written (lookup-first, no hand-rolled
 *    substitutes for library primitives).
 *
 * The MCP connection itself is a separate patch row (`@deepseek-ai/dsh-mcp-client`)
 * so it can be enabled, disabled, or retargeted independently of the skills.
 */

import { registerSkillsEffect } from './lib/skills.js'
import { SECTION_NAME, SECTION_ORDER, SECTION_TEXT } from './lib/prompt.js'

export const name = 'copilotkit'

export function apply(ctx, config = {}) {
  const log = (message) => {
    const logger = ctx.logger
    if (logger && typeof logger.warn === 'function') logger.warn(`copilotkit: ${message}`)
  }

  const skillsEffect = registerSkillsEffect(ctx, config, log)
  if (skillsEffect !== undefined) ctx.effect(skillsEffect, 'copilotkit skills')
  else log('ctx.skills is unavailable; the bundled CopilotKit skills were not registered')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined && typeof systemPrompt.section === 'function') {
    ctx.effect(
      () => systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: SECTION_TEXT }),
      'copilotkit prompt section',
    )
  }
}

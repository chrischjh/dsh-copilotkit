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
 * 3. A read-only `copilotkit_selfcheck` tool for the agent, plus a same-origin
 *    `/copilotkit/selfcheck` route behind the detail-page button. Both report
 *    skills + MCP health; the button's route also repairs a disabled or stale
 *    `copilotkit-docs` row through the official plugin manager API.
 *
 * The MCP connection itself is a separate patch row (`@deepseek-ai/dsh-mcp-client`)
 * so it can be enabled, disabled, or retargeted independently of the skills.
 */

import { SELFCHECK_TOOL_NAME } from './lib/constants.js'
import { registerSkillsEffect } from './lib/skills.js'
import { SECTION_NAME, SECTION_ORDER, SECTION_TEXT } from './lib/prompt.js'
import { createSelfcheckTool } from './lib/selfcheck.js'
import { createSelfcheckRoute } from './lib/route.js'

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

  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.register === 'function') {
    ctx.effect(() => tools.register(createSelfcheckTool(ctx, config)), 'copilotkit selfcheck tool')
  } else {
    log('ctx.tools is unavailable; the copilotkit_selfcheck tool was not registered')
  }

  // The detail-page button posts here; the route exists only where the Web
  // server runs, so headless profiles simply omit the UI half.
  const webServer = ctx.get('webServer')
  if (webServer !== undefined && typeof webServer.register === 'function') {
    ctx.effect(
      () => webServer.register(createSelfcheckRoute(ctx, config, log)),
      'copilotkit selfcheck route',
    )
  }

  return { tools: [SELFCHECK_TOOL_NAME] }
}

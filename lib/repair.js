// Repair orchestration behind the detail-page button and the agent tool.
//
// The repair uses only official DSH mechanisms:
//   * skill health comes from ctx.skills.snapshot() (its `complete` flag);
//   * MCP registration health comes from ctx.tools;
//   * a broken or disabled `copilotkit-docs` row is repaired through the
//     plugin manager's public `listPlugins()` / `setPluginEnabled()` API, and
//     a refused or failed change is reported with the manager's own
//     `ManagementError` code (`management-required`, `unaddressable`, ...);
//   * unreachable networks are not "fixed" — they are reported, with the
//     skills' Markdown fallback named as the degraded path.

import { collectSkillsHealth, countRegisteredTools, MCP_TOOL_NAMES, probeMcpServer, runSelfcheck } from './selfcheck.js'

/** Patch id of the MCP row this bundle declares. */
const ROW_PATCH_ID = 'copilotkit-docs'
/** Module the MCP row names. */
const ROW_MODULE = '@deepseek-ai/dsh-mcp-client'

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort)
    resolve()
  }, ms)
  function onAbort() {
    clearTimeout(timer)
    reject(new Error('repair aborted'))
  }
  if (signal?.aborted) return onAbort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
})

async function locateRow(ctx) {
  const manager = ctx.get('pluginManager')
  if (manager === undefined || typeof manager.listPlugins !== 'function' || typeof manager.setPluginEnabled !== 'function') {
    return { manager: undefined, row: undefined }
  }
  try {
    const rows = await manager.listPlugins()
    const row = rows.find(entry => entry.patchId === ROW_PATCH_ID && entry.moduleName === ROW_MODULE)
      ?? rows.find(entry => entry.moduleName === ROW_MODULE && typeof entry.entryId === 'string' && entry.entryId.includes(ROW_PATCH_ID))
    return { manager, row }
  } catch (error) {
    return { manager, row: undefined, error }
  }
}

function changeFacts(change) {
  return {
    application: change?.application,
    changed: change?.changed,
    ...change?.error === undefined ? {} : { error: { code: change.error.code, message: change.error.message } },
  }
}

function failureOfResult(result) {
  const { skills, mcp } = result
  if (skills === undefined || !skills.copilotkit || !skills['copilotkit-cli']) {
    return { code: 'skills-unavailable', message: 'The bundled copilotkit / copilotkit-cli skills are not registered; enable the `copilotkit` plugin row.' }
  }
  if (!skills.complete) {
    return { code: 'skills-incomplete', message: 'Skill discovery did not complete; it retries on the next request. If it persists, check the skill roots for unreadable directories.' }
  }
  if (mcp.registeredTools < MCP_TOOL_NAMES.length) {
    return { code: 'mcp-tools-missing', message: `Only ${mcp.registeredTools}/${MCP_TOOL_NAMES.length} MCP tools are registered; the \`copilotkit-docs\` row is disabled or its initial sync failed.` }
  }
  if (!mcp.server.ok) {
    return { code: 'mcp-unreachable', message: `The docs server at ${mcp.url} is unreachable (${mcp.server.error}). Network access is not something the plugin can repair; the skills keep working through https://docs.copilotkit.ai/<path>.md.` }
  }
  return { code: 'repair-failed', message: 'The self-check still reports a problem after the repair attempts.' }
}

/**
 * Check, repair what can be repaired through official APIs, re-check, and
 * return a report the UI and the agent tool can both present.
 * @param ctx - Cordis context of the bundle plugin.
 * @param config - bundle row config.
 * @param options - { signal, fetchImpl, now } for cancellation and testing.
 */
export async function selfcheckWithRepair(ctx, config = {}, options = {}) {
  const wait = options.sleep ?? sleep
  const actions = []
  const fetchedAt = (options.now?.() ?? Date.now())
  let result = await runSelfcheck(ctx, config, options)

  // Skills: retry discovery before giving up on the incomplete flag.
  if (!result.skills.complete || !result.skills.copilotkit || !result.skills['copilotkit-cli']) {
    actions.push({ action: 'retry-skill-discovery', result: 'attempted' })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await wait(250, options.signal)
      const skills = await collectSkillsHealth(ctx, options)
      result = { ...result, skills }
      if (skills.complete && skills.copilotkit && skills['copilotkit-cli']) break
    }
  }

  // MCP: locate the row, enable it, or restart its connection.
  const needsRowWork = result.mcp.registeredTools < MCP_TOOL_NAMES.length || !result.mcp.server.ok
  let repairNote
  if (needsRowWork) {
    const { manager, row, error } = await locateRow(ctx)
    if (manager === undefined) {
      repairNote = { code: 'management-required', message: 'The plugin manager service is unavailable in this profile, so the MCP row cannot be restarted from here.' }
    } else if (row === undefined) {
      repairNote = { code: 'unaddressable', message: `No ${ROW_MODULE} row named "${ROW_PATCH_ID}" was found; reinstall the bundle to restore its patch rows.`, detail: error === undefined ? undefined : String(error) }
    } else if (row.readOnlyReason !== undefined) {
      repairNote = { code: row.readOnlyReason, message: `The MCP row is read-only here (${row.readOnlyReason}); change it from the profile configuration.` }
    } else {
      try {
        if (!row.enabled) {
          const change = await manager.setPluginEnabled(row.entryId, true)
          actions.push({ action: 'enable-row', ...changeFacts(change) })
          if (change?.application === 'failed') repairNote = change.error ?? { code: 'operation-error', message: 'The plugin manager refused to enable the MCP row.' }
        } else {
          // A connection that synced once and then went stale only recovers on a fresh mount.
          const off = await manager.setPluginEnabled(row.entryId, false)
          actions.push({ action: 'restart-row', step: 'disable', ...changeFacts(off) })
          const on = await manager.setPluginEnabled(row.entryId, true)
          actions.push({ action: 'restart-row', step: 'enable', ...changeFacts(on) })
          if (on?.application === 'failed') repairNote = on.error ?? { code: 'operation-error', message: 'The plugin manager refused to restart the MCP row.' }
        }
        // Wait for the fresh generation to register its tools before probing.
        for (let attempt = 0; attempt < 10 && countRegisteredTools(ctx) < MCP_TOOL_NAMES.length; attempt += 1) {
          await wait(400, options.signal)
        }
      } catch (error) {
        repairNote = { code: error?.code ?? 'operation-error', message: error?.message ?? String(error) }
      }
    }
  }

  // Re-probe up to twice when the network, not the row, was the problem.
  if (!result.mcp.server.ok) {
    actions.push({ action: 'retry-probe', result: 'attempted' })
    for (let attempt = 0; attempt < 2 && !result.mcp.server.ok; attempt += 1) {
      await wait(700, options.signal)
      const server = await probeMcpServer(result.mcp.url, {
        timeoutMs: config.probeTimeoutMs ?? 15000,
        signal: options.signal,
        fetchImpl: options.fetchImpl,
      })
      result = { ...result, mcp: { ...result.mcp, server, registeredTools: countRegisteredTools(ctx) } }
    }
  }

  // One authoritative final read after all repairs.
  result = await runSelfcheck(ctx, config, options)
  const healthy = result.healthy
  const failure = healthy
    ? undefined
    : (repairNote ?? failureOfResult(result))
  return {
    ok: healthy,
    healthy,
    checkedAt: fetchedAt,
    skills: result.skills,
    mcp: result.mcp,
    actions,
    ...failure === undefined ? {} : { failure },
  }
}

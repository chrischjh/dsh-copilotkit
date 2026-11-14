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

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { collectSkillsHealth, countRegisteredTools, MCP_TOOL_NAMES, probeMcpServer, runSelfcheck } from './selfcheck.js'

/** Patch id of the MCP row this bundle declares. */
const ROW_PATCH_ID = 'dsh-copilotkit-docs'
/** Row id used by bundle versions before 0.2.3; still repaired when present. */
const LEGACY_ROW_PATCH_ID = 'copilotkit-docs'
/** Module the MCP row names. */
const ROW_MODULE = '@deepseek-ai/dsh-mcp-client'

/** DSH ships its own node + pnpm 11; using them avoids store-version clashes with the user's global pnpm. */
export const BUNDLED_NODE = join(homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node')
export const BUNDLED_PNPM = join(homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs')

function runCommand(file, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000
  return new Promise((resolve) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, signal: options.signal }, (error, stdout, stderr) => {
      resolve({ ok: error === undefined, code: error?.code, output: `${stdout}${stderr}`.slice(-1200) })
    })
    return child
  })
}

/**
 * Align a shadowed profile copy of @deepseek-ai/dsh-mcp-client to the DSH-shipped
 * version using the DSH-bundled node + pnpm. Mutates the profile dependency, so
 * callers must obtain explicit user confirmation first.
 */
export async function alignMcpClientShadow(shadow, options = {}) {
  const profileDir = process.env.DSH_PROFILE_DIR
  if (profileDir === undefined) return { ok: false, error: 'DSH_PROFILE_DIR is unavailable in this process' }
  if (!existsSync(BUNDLED_NODE) || !existsSync(BUNDLED_PNPM)) {
    return { ok: false, error: 'the DSH-bundled node/pnpm runtime was not found; align manually with pnpm add --dir' }
  }
  const run = options.runAlign ?? runCommand
  const result = await run(BUNDLED_NODE, [BUNDLED_PNPM, 'add', `@deepseek-ai/dsh-mcp-client@${shadow.shippedVersion}`, '--save-exact', '--dir', profileDir], options)
  return { ok: result.ok, output: result.output, error: result.ok ? undefined : (result.error ?? 'pnpm add failed') }
}

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
      ?? rows.find(entry => entry.patchId === LEGACY_ROW_PATCH_ID && entry.moduleName === ROW_MODULE)
      ?? rows.find(entry => entry.moduleName === ROW_MODULE && typeof entry.entryId === 'string' && (entry.entryId.includes(ROW_PATCH_ID) || entry.entryId.includes(LEGACY_ROW_PATCH_ID)))
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
  if (mcp.shadow !== undefined) {
    return { code: 'mcp-shadow', message: `The profile installs @deepseek-ai/dsh-mcp-client ${mcp.shadow.profileVersion} while this DSH ships ${mcp.shadow.shippedVersion}; use the Align button (or run pnpm add --dir) to align, then restart DSH.` }
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
  let alignedRestartPending = false
  const fetchedAt = (options.now?.() ?? Date.now())
  const detectShadow = options.detectShadow ?? undefined
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
  // A network blip is not a broken row: only missing registrations trigger row work.
  const needsRowWork = result.mcp.registeredTools < MCP_TOOL_NAMES.length
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

  // Reachability already retried inside the probe; record the exhausted attempt.
  if (!result.mcp.server.ok) actions.push({ action: 'retry-probe', result: 'exhausted' })

  // A version shadow is the one problem a row restart cannot fix; align only
  // when the caller explicitly opted in (the detail-page confirm button).
  if (result.mcp.shadow !== undefined) {
    if (options.align === true) {
      const alignedVersion = result.mcp.shadow.shippedVersion
      const align = await alignMcpClientShadow(result.mcp.shadow, options)
      actions.push({ action: 'align-mcp-client', ok: align.ok, ...align.error === undefined ? {} : { error: align.error } })
      if (align.ok) {
        alignedRestartPending = true
        actions.push({ action: 'restart-dsh', result: 'required' })
      } else {
        actions.push({ action: 'retry-probe', result: 'attempted' })
      }
    }
  }

  // One authoritative final read after all repairs.
  result = await runSelfcheck(ctx, config, { ...options, detectShadow })
  if (alignedRestartPending && result.mcp.shadow === undefined) {
    // The copy is aligned on disk; the running DSH still holds the old module until restart.
    return {
      ok: false, healthy: false, checkedAt: (options.now?.() ?? Date.now()),
      skills: result.skills, mcp: result.mcp, actions,
      failure: { code: 'restart-required', message: `Aligned the profile copy to @deepseek-ai/dsh-mcp-client@${alignedVersion}: fully restart DSH (Cmd+Q), then run the check again.` },
    }
  }
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

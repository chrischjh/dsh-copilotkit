// Self-check for the two halves of the CopilotKit kit.
//
// Skills health: the bundled registrations must appear in ctx.skills' catalog
// (and discovery must have completed, so an incomplete provider is reported
// instead of a false green).
//
// MCP health: two independent facts —
//   * DSH-side registration: are the 7 mcp__copilotkit__* tools registered on
//     ctx.tools? (They exist once the mcp-client row connected and synced.)
//   * server-side reachability: a one-shot read-only MCP handshake
//     (initialize + tools/list + session close) against the public endpoint.
// A registered tool set with a failing probe means a stale connection; a
// passing probe with no registered tools means the row is disabled or the
// initial sync never happened.

import { SELFCHECK_TOOL_NAME } from './constants.js'

export const MCP_URL = 'https://mcp.copilotkit.ai/mcp'
export const MCP_TOOL_NAMES = [
  'search-docs',
  'search-code',
  'search-ag-ui-docs',
  'search-ag-ui-code',
  'explore-docs',
  'explore-code',
  'submit-feedback',
]

function publicToolName(name) {
  return `mcp__copilotkit__${name}`
}

function parseSse(text) {
  const results = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data === '') continue
    try {
      results.push(JSON.parse(data))
    } catch {
      // A non-JSON data line is not the payload this probe needs.
    }
  }
  return results
}

async function readJsonResponse(response) {
  const type = response.headers?.get?.('content-type') ?? ''
  if (typeof response.text === 'function' && type.includes('text/event-stream')) {
    const messages = parseSse(await response.text())
    return messages.at(-1)
  }
  return await response.json()
}

/**
 * One-shot, read-only probe of the CopilotKit docs MCP server.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - whole-probe budget.
 * @param {AbortSignal} [options.signal] - caller cancellation, raced with the budget.
 * @param {typeof fetch} [options.fetchImpl] - injectable transport for tests.
 * @returns {Promise<{ok: boolean, tools: number, server?: string, latencyMs: number, error?: string}>}
 */
export async function probeMcpServer(url = MCP_URL, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const started = Date.now()
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = options.signal === undefined
    ? timeout
    : AbortSignal.any([options.signal, timeout])
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  let sessionId
  try {
    const init = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'dsh-copilotkit-selfcheck', version: '0.1.0' },
        },
      }),
      signal,
    })
    if (!init.ok) throw new Error(`initialize HTTP ${init.status}`)
    sessionId = init.headers?.get?.('mcp-session-id') ?? undefined
    const initialized = await readJsonResponse(init)
    if (initialized?.result === undefined) throw new Error('initialize returned no result')
    const sessionHeaders = sessionId === undefined ? headers : { ...headers, 'mcp-session-id': sessionId }
    await fetchImpl(url, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal,
    })
    const list = await fetchImpl(url, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal,
    })
    if (!list.ok) throw new Error(`tools/list HTTP ${list.status}`)
    const payload = await readJsonResponse(list)
    const tools = payload?.result?.tools
    if (!Array.isArray(tools)) throw new Error('tools/list returned no tool array')
    return {
      ok: true,
      tools: tools.length,
      server: initialized.result?.serverInfo?.name ?? 'unknown',
      latencyMs: Date.now() - started,
    }
  } catch (error) {
    return { ok: false, tools: 0, latencyMs: Date.now() - started, error: describeError(error) }
  } finally {
    if (sessionId !== undefined) {
      const closing = { method: 'DELETE', headers: { ...headers, 'mcp-session-id': sessionId } }
      // The session was never opened by DSH's client, so best-effort cleanup only.
      void fetchImpl(url, closing).catch(() => {})
    }
  }
}

function describeError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'probe timed out'
  return error instanceof Error ? error.message : String(error)
}

/**
 * Gather skills and MCP health for the CopilotKit kit.
 * @param {object} ctx - Cordis context of the bundle plugin.
 * @param {object} config - bundle row config (mcpUrl override).
 * @param {object} [options] - { signal, fetchImpl } for cancellation/testing.
 */
export async function runSelfcheck(ctx, config = {}, options = {}) {
  const skills = ctx.get('skills')
  const skillsResult = { copilotkit: false, 'copilotkit-cli': false, complete: true }
  if (skills !== undefined && typeof skills.snapshot === 'function') {
    try {
      const snapshot = await skills.snapshot({ signal: options.signal })
      skillsResult.complete = snapshot.complete === true
      const names = new Set(snapshot.skills.map(skill => skill.name))
      skillsResult.copilotkit = names.has('copilotkit')
      skillsResult['copilotkit-cli'] = names.has('copilotkit-cli')
    } catch (error) {
      skillsResult.complete = false
      skillsResult.error = describeError(error)
    }
  } else {
    skillsResult.complete = false
    skillsResult.error = 'ctx.skills is unavailable'
  }

  const tools = ctx.get('tools')
  const mcp = { url: config.mcpUrl ?? MCP_URL, registeredTools: 0 }
  if (tools !== undefined && typeof tools.get === 'function') {
    for (const name of MCP_TOOL_NAMES) {
      if (tools.get(publicToolName(name)) !== undefined) mcp.registeredTools += 1
    }
  }
  mcp.server = await probeMcpServer(mcp.url, {
    timeoutMs: config.probeTimeoutMs ?? 15000,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })

  const healthy = skillsResult.copilotkit
    && skillsResult['copilotkit-cli']
    && skillsResult.complete
    && mcp.registeredTools === MCP_TOOL_NAMES.length
    && mcp.server.ok
  return { healthy, skills: skillsResult, mcp }
}

/** Model-facing renderer: a compact, actionable status report. */
export function renderSelfcheck(_args, value) {
  const skills = value.skills
  const mcp = value.mcp
  const lines = [
    `${value.healthy ? 'Healthy' : 'Degraded'}: CopilotKit kit self-check`,
    '',
    `Skills (${skills.complete ? 'discovery complete' : 'discovery INCOMPLETE'}):`,
    `- copilotkit: ${skills.copilotkit ? 'registered' : 'MISSING'}`,
    `- copilotkit-cli: ${skills['copilotkit-cli'] ? 'registered' : 'MISSING'}`,
    ...skills.error === undefined ? [] : [`- error: ${skills.error}`],
    '',
    `MCP server ${mcp.url}:`,
    `- DSH-registered tools: ${mcp.registeredTools}/${MCP_TOOL_NAMES.length}`,
    mcp.server.ok
      ? `- server reachable (${mcp.server.server}, ${mcp.server.tools} tools, ${mcp.server.latencyMs} ms)`
      : `- server UNREACHABLE: ${mcp.server.error}`,
  ]
  if (!value.healthy) {
    const fixes = []
    if (!skills.copilotkit || !skills['copilotkit-cli']) fixes.push('enable the `copilotkit` plugin row in Plugins')
    if (!skills.complete) fixes.push('retry the next turn so skill discovery can complete')
    if (mcp.registeredTools < MCP_TOOL_NAMES.length) fixes.push('enable the `copilotkit-docs` row in Plugins (or restart the Host after a reconnect gave up)')
    if (!mcp.server.ok) fixes.push('check network reachability of the MCP endpoint; the skills still work via docs.copilotkit.ai .md pages')
    lines.push('', 'Next:', ...fixes.map(fix => `- ${fix}`))
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Tool definition for ctx.tools.register(). */
export function createSelfcheckTool(ctx, config = {}) {
  return {
    name: SELFCHECK_TOOL_NAME,
    description: 'Check whether the dsh-copilotkit kit is healthy right now: whether the bundled `copilotkit` and `copilotkit-cli` skills are registered and discovery completed, whether the 7 mcp__copilotkit__* tools are registered in this DSH, and whether the CopilotKit docs MCP server is reachable (a read-only initialize + tools/list probe). Reports what to fix when degraded. Read-only; sends one short probe to the public MCP endpoint.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          healthy: { type: 'boolean' },
          skills: {
            type: 'object',
            additionalProperties: false,
            properties: {
              copilotkit: { type: 'boolean' },
              'copilotkit-cli': { type: 'boolean' },
              complete: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
          mcp: {
            type: 'object',
            additionalProperties: false,
            properties: {
              url: { type: 'string' },
              registeredTools: { type: 'number' },
              server: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  tools: { type: 'number' },
                  latencyMs: { type: 'number' },
                  server: { type: 'string' },
                  error: { type: 'string' },
                },
              },
            },
          },
        },
      },
      render: renderSelfcheck,
    },
    timeoutMs: 30000,
    presentCall() {
      return { card: 'generic', title: 'Self-check CopilotKit kit', kind: 'read' }
    },
    async execute(_args, exec) {
      return await runSelfcheck(ctx, config, { signal: exec.signal })
    },
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { createSelfcheckTool, MCP_TOOL_NAMES, probeMcpServer, renderSelfcheck, runSelfcheck } from '../lib/selfcheck.js'

function reply({ status = 200, headers = {}, json, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async json() {
      if (json === undefined) throw new Error('no json body')
      return json
    },
    async text() {
      if (text === undefined) throw new Error('no text body')
      return text
    },
  }
}

function toolsArray(count = MCP_TOOL_NAMES.length) {
  return Array.from({ length: count }, (_, index) => ({ name: `tool-${index}` }))
}

test('probeMcpServer performs the handshake and reports the tool count', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body })
    if (init.body?.includes('initialize')) {
      return reply({
        headers: { 'mcp-session-id': 'sess-1' },
        json: { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'copilotkit-docs-mcp' } } },
      })
    }
    if (init.body?.includes('notifications/initialized')) return reply({ status: 202 })
    if (init.body?.includes('tools/list')) {
      return reply({ json: { jsonrpc: '2.0', id: 2, result: { tools: toolsArray() } } })
    }
    return reply()
  }
  const result = await probeMcpServer('https://example.test/mcp', { fetchImpl, retryDelayMs: 0 })
  assert.equal(result.ok, true)
  assert.equal(result.tools, MCP_TOOL_NAMES.length)
  assert.equal(result.server, 'copilotkit-docs-mcp')
  assert.equal(calls.filter(call => call.method === 'POST').length, 3)
  assert.deepEqual(calls[2].headers['mcp-session-id'], 'sess-1')
  assert.equal(calls.at(-1).method, 'DELETE')
})

test('probeMcpServer parses a text/event-stream tools/list payload', async () => {
  const fetchImpl = async (url, init) => {
    if (init.body?.includes('initialize')) {
      return reply({ headers: { 'mcp-session-id': 'sess-2' }, json: { result: { serverInfo: { name: 'sse-server' } } } })
    }
    if (init.body?.includes('notifications/initialized')) return reply({ status: 202 })
    if (init.body?.includes('tools/list')) {
      return reply({
        headers: { 'content-type': 'text/event-stream' },
        text: 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"a"},{"name":"b"}]}}\n\n',
      })
    }
    return reply()
  }
  const result = await probeMcpServer('https://example.test/mcp', { fetchImpl, retryDelayMs: 0 })
  assert.equal(result.ok, true)
  assert.equal(result.tools, 2)
  assert.equal(result.server, 'sse-server')
})

test('probeMcpServer reports an unreachable server without throwing', async () => {
  const fetchImpl = async (url, init) => {
    if (init?.method === 'POST') return reply({ status: 502 })
    return reply()
  }
  const result = await probeMcpServer('https://example.test/mcp', { fetchImpl, retryDelayMs: 0 })
  assert.equal(result.ok, false)
  assert.match(result.error, /HTTP 502/)
})

function healthyCtx() {
  return {
    get(name) {
      if (name === 'skills') {
        return {
          snapshot: async () => ({
            complete: true,
            skills: [{ name: 'copilotkit' }, { name: 'copilotkit-cli' }],
          }),
        }
      }
      if (name === 'tools') return { get: () => ({ name: 'registered' }) }
      return undefined
    },
  }
}

const passingFetch = async (url, init) => {
  if (init.body?.includes('initialize')) {
    return reply({ headers: { 'mcp-session-id': 's1' }, json: { result: { serverInfo: { name: 'ck' } } } })
  }
  if (init.body?.includes('notifications/initialized')) return reply({ status: 202 })
  if (init.body?.includes('tools/list')) return reply({ json: { result: { tools: toolsArray() } } })
  return reply()
}

test('runSelfcheck is healthy only when skills, registration, and the server all agree', async () => {
  const result = await runSelfcheck(healthyCtx(), {}, { fetchImpl: passingFetch })
  assert.equal(result.healthy, true)
  assert.equal(result.skills.complete, true)
  assert.equal(result.mcp.registeredTools, MCP_TOOL_NAMES.length)
  assert.equal(result.mcp.server.ok, true)
  assert.match(renderSelfcheck({}, result)[0].text, /Healthy/)
})

test('runSelfcheck reports the degraded cause and its fix', async () => {
  const ctx = {
    get(name) {
      if (name === 'skills') {
        return { snapshot: async () => ({ complete: false, skills: [{ name: 'copilotkit' }] }) }
      }
      if (name === 'tools') return { get: () => undefined }
      return undefined
    },
  }
  const result = await runSelfcheck(ctx, {}, { fetchImpl: async () => reply({ status: 503 }) })
  assert.equal(result.healthy, false)
  assert.equal(result.skills['copilotkit-cli'], false)
  assert.equal(result.skills.complete, false)
  assert.equal(result.mcp.registeredTools, 0)
  const text = renderSelfcheck({}, result)[0].text
  assert.match(text, /Degraded/)
  assert.match(text, /enable the `copilotkit-docs` row/)
  assert.match(text, /retry the next turn/)
  assert.match(text, /docs\.copilotkit\.ai/)
})

test('createSelfcheckTool declares the selfcheck contract', () => {
  const tool = createSelfcheckTool(healthyCtx(), {})
  assert.equal(tool.name, 'copilotkit_selfcheck')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(tool.parameters.additionalProperties, false)
  assert.match(tool.description, /read-only/i)
  assert.equal(typeof tool.presentCall, 'function')
})

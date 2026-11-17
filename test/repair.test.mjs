import assert from 'node:assert/strict'
import test from 'node:test'
import { createSelfcheckRoute, SELFCHECK_PATH } from '../lib/route.js'
import { selfcheckWithRepair } from '../lib/repair.js'
import { MCP_TOOL_NAMES } from '../lib/selfcheck.js'

const NO_WAIT = async () => {}

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

function passingFetch() {
  return async (url, init) => {
    if (init.body?.includes('initialize')) {
      return reply({ headers: { 'mcp-session-id': 's1' }, json: { result: { serverInfo: { name: 'ck' } } } })
    }
    if (init.body?.includes('notifications/initialized')) return reply({ status: 202 })
    if (init.body?.includes('tools/list')) {
      return reply({ json: { result: { tools: MCP_TOOL_NAMES.map(name => ({ name })) } } })
    }
    return reply()
  }
}

const failingFetch = async (url, init) => (init.method === 'POST' ? reply({ status: 503 }) : reply())

/**
 * A fake Host: skills snapshot, tool registry, and a plugin manager whose row
 * enablement really drives the registered tool count.
 */
function fakeHost(options = {}) {
  const state = {
    enabled: options.enabled ?? true,
    toolsRegistered: options.toolsRegistered ?? (options.enabled ?? true),
    skillsPresent: options.skillsPresent ?? true,
    skillsComplete: options.skillsComplete ?? true,
    calls: [],
    readonlyReason: options.readonlyReason,
    changeFailureCode: options.changeFailureCode,
  }
  const tools = {
    get: () => (state.toolsRegistered ? { name: 'registered' } : undefined),
  }
  const skills = {
    snapshot: async () => ({
      complete: state.skillsComplete,
      skills: state.skillsPresent ? [{ name: 'copilotkit' }, { name: 'copilotkit-cli' }] : [{ name: 'copilotkit' }],
    }),
  }
  const manager = options.manager === null ? undefined : {
    listPlugins: async () => [{ entryId: 'include:copilotkit-docs', patchId: options.patchId ?? 'dsh-copilotkit-docs', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: state.enabled, ...state.readonlyReason === undefined ? {} : { readOnlyReason: state.readonlyReason } }],
    setPluginEnabled: async (entryId, enabled) => {
      state.calls.push({ entryId, enabled })
      if (state.changeFailureCode !== undefined) {
        return { stage: 'enable', target: entryId, enabled, changed: false, application: 'failed', error: { code: state.changeFailureCode, message: 'prepared failure' } }
      }
      state.enabled = enabled
      state.toolsRegistered = enabled
      return { stage: 'enable', target: entryId, enabled, changed: true, application: 'applied' }
    },
  }
  const ctx = {
    get(name) {
      if (name === 'skills') return skills
      if (name === 'tools') return tools
      if (name === 'pluginManager') return manager
      return undefined
    },
    logger: { warn: () => {}, error: () => {} },
  }
  return { ctx, state }
}

test('healthy host needs no repair', async () => {
  const { ctx, state } = fakeHost()
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, true)
  assert.equal(result.failure, undefined)
  assert.deepEqual(result.actions, [])
  assert.equal(state.calls.length, 0)
})

test('a disabled MCP row is enabled through the plugin manager', async () => {
  const { ctx, state } = fakeHost({ enabled: false })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, true)
  assert.equal(state.calls.length, 1)
  assert.deepEqual(state.calls[0], { entryId: 'include:copilotkit-docs', enabled: true })
  assert.ok(result.actions.some(action => action.action === 'enable-row' && action.application === 'applied'))
})

test('a stale connection is restarted by disabling and re-enabling the row', async () => {
  const { ctx, state } = fakeHost({ toolsRegistered: 0 })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, true)
  assert.deepEqual(state.calls.map(call => call.enabled), [false, true])
  const restart = result.actions.filter(action => action.action === 'restart-row')
  assert.equal(restart.length, 2)
})

test('a plugin manager refusal is reported with its ManagementError code', async () => {
  const { ctx } = fakeHost({ enabled: false, changeFailureCode: 'management-required' })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, false)
  assert.equal(result.failure.code, 'management-required')
  assert.match(result.failure.message, /prepared failure/)
})

test('a read-only row surfaces its official readOnlyReason', async () => {
  const { ctx } = fakeHost({ enabled: false, readonlyReason: 'unaddressable' })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, false)
  assert.equal(result.failure.code, 'unaddressable')
})

test('pre-0.2.3 legacy row ids are still repaired', async () => {
  const { ctx, state } = fakeHost({ enabled: false, patchId: 'copilotkit-docs' })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, true)
  assert.equal(state.calls.length, 1)
  assert.ok(result.actions.some(action => action.action === 'enable-row'))
})

test('a missing plugin manager reports management-required', async () => {
  const { ctx } = fakeHost({ manager: null, enabled: false, toolsRegistered: 0 })
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  assert.equal(result.ok, false)
  assert.equal(result.failure.code, 'management-required')
})

test('an unreachable server is reported, not silently fixed', async () => {
  const { ctx, state } = fakeHost()
  const result = await selfcheckWithRepair(ctx, {}, { fetchImpl: failingFetch, sleep: NO_WAIT, probeRetryDelayMs: 0 })
  assert.equal(result.ok, false)
  assert.equal(result.failure.code, 'mcp-unreachable')
  assert.match(result.failure.message, /docs\.copilotkit\.ai/)
  assert.ok(result.actions.some(action => action.action === 'retry-probe'))
  assert.equal(state.calls.length, 0) // a network blip must not restart the MCP row
})

function routeHarness(ctx) {
  const requests = []
  const makeReq = ({ method = 'POST', path = SELFCHECK_PATH, headers = { 'content-type': 'application/json', host: '127.0.0.1:1' } } = {}) => ({
    method,
    url: path,
    headers,
    resume() {},
    on(event, handler) { if (event === 'end') handler() },
  })
  const makeRes = () => {
    const out = { status: undefined, headers: undefined, body: undefined }
    return {
      out,
      writeHead(status, headers) { out.status = status; out.headers = headers },
      end(text) { out.body = text; requests.push(out) },
    }
  }
  const route = createSelfcheckRoute(ctx, {}, () => {}, { fetchImpl: passingFetch(), sleep: NO_WAIT })
  return { route, makeReq, makeRes, requests }
}

test('route refuses a request the connection service rejects', async () => {
  const { ctx } = fakeHost()
  const original = ctx.get
  ctx.get = (service) => service === 'connection' ? { requestRejection: () => 403 } : original(service)
  const { route, makeReq, makeRes } = routeHarness(ctx)
  const res = makeRes()
  await route.handler(makeReq({ headers: { 'content-type': 'application/json', host: '127.0.0.1:1' } }), res)
  assert.equal(res.out.status, 403)
  assert.equal(JSON.parse(res.out.body).code, 'forbidden')
})

test('route still works when the connection service is absent', async () => {
  const { ctx } = fakeHost()
  const original = ctx.get
  ctx.get = (service) => service === 'connection' ? undefined : original(service)
  const { route, makeReq, makeRes } = routeHarness(ctx)
  const res = makeRes()
  await route.handler(makeReq(), res)
  assert.equal(res.out.status, 200)
  assert.equal(JSON.parse(res.out.body).ok, true)
})

test('route accepts the same-origin JSON POST and returns the report', async () => {
  const { ctx } = fakeHost()
  const { route, makeReq, makeRes } = routeHarness(ctx)
  const res = makeRes()
  await route.handler(makeReq(), res)
  assert.equal(res.out.status, 200)
  const body = JSON.parse(res.out.body)
  assert.equal(body.ok, true)
  assert.equal(body.mcp.registeredTools, MCP_TOOL_NAMES.length)
})

test('route refuses other methods, origins, content types, and paths', async () => {
  const { ctx } = fakeHost()
  for (const [label, request, status] of [
    ['GET', { method: 'GET' }, 405],
    ['cross-origin', { headers: { 'content-type': 'application/json', host: '127.0.0.1:1', origin: 'https://evil.example' } }, 403],
    ['form body', { headers: { 'content-type': 'text/plain', host: '127.0.0.1:1' } }, 415],
    ['other path', { path: '/copilotkit/nope' }, 404],
  ]) {
    const { route, makeReq, makeRes } = routeHarness(ctx)
    const res = makeRes()
    await route.handler(makeReq(request), res)
    assert.equal(res.out.status, status, label)
    assert.equal(JSON.parse(res.out.body).ok, false, label)
  }
})

test('route reports a failed repair with a structured failure body', async () => {
  const { ctx } = fakeHost({ enabled: false, changeFailureCode: 'unaddressable' })
  const { route, makeReq, makeRes } = routeHarness(ctx)
  const res = makeRes()
  await route.handler(makeReq(), res)
  assert.equal(res.out.status, 200)
  const body = JSON.parse(res.out.body)
  assert.equal(body.ok, false)
  assert.equal(body.failure.code, 'unaddressable')
})

test('the self-check route waits for the webServer service instead of skipping it', async () => {
  const { apply } = await import('../index.js')
  const calls = []
  let injected
  const base = {
    get(service) { return undefined },
    effect(factory, label) { calls.push(label); return () => {} },
    logger: { warn() {} },
    inject(deps, callback) { injected = { deps, callback } },
  }
  apply(base)
  assert.deepEqual(injected.deps, ['webServer'])
  const scoped = {
    get(service) { return service === 'webServer' ? { register: (route) => { calls.push(`${route.kind}:${route.path}`); return () => {} } } : undefined },
    effect(factory, label) { factory(); return () => {} },
  }
  injected.callback(scoped)
  assert.ok(calls.includes('prefix:/copilotkit'), `route registered via inject (got ${calls.join(', ')})`)
})

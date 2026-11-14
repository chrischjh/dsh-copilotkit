// Same-origin HTTP entry point behind the detail-page button.
//
// The route is registered on the Host's web server, so the browser half needs
// no generated Remote binding. It accepts only POST + JSON from the same
// origin (the page's own copy of the UI), and every refusal or failure is a
// structured ManagementError-shaped body plus a Host log line.

import { selfcheckWithRepair } from './repair.js'

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let text = ''
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { resolve({}); req.destroy(); return }
      text += chunk
    })
    req.on('end', () => {
      try { resolve(text === '' ? {} : JSON.parse(text)) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

export const ROUTE_PREFIX = '/copilotkit'
export const SELFCHECK_PATH = '/copilotkit/selfcheck'

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Build the web-server route contribution.
 * @param ctx - Host context of the bundle plugin.
 * @param config - bundle row config.
 * @param log - Host logger callback for failures.
 */
export function createSelfcheckRoute(ctx, config, log = () => {}, options = {}) {
  return {
    kind: 'prefix',
    path: ROUTE_PREFIX,
    async handler(req, res) {
      const url = new URL(req.url ?? '/', 'http://local')
      if (url.pathname !== SELFCHECK_PATH) return sendJson(res, 404, { ok: false, code: 'not-found', message: `unknown route ${url.pathname}` })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'use POST' })
      const origin = req.headers.origin
      if (origin !== undefined && origin.replace(/^https?:\/\//, '') !== req.headers.host) {
        return sendJson(res, 403, { ok: false, code: 'forbidden-origin', message: 'cross-origin requests are refused' })
      }
      if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) {
        return sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'send application/json' })
      }
      const body = await readBody(req)
      const controller = new AbortController()
      const deadline = setTimeout(() => controller.abort(), 60000)
      try {
        const result = await selfcheckWithRepair(ctx, config, { ...options, signal: controller.signal })
        if (!result.ok) log(`self-check failed (${result.failure?.code}): ${result.failure?.message}`)
        return sendJson(res, 200, result)
      } catch (error) {
        const code = error?.code ?? 'operation-error'
        const message = error?.message === undefined ? String(error) : String(error.message)
        log(`self-check error (${code}): ${message}`)
        return sendJson(res, 500, { ok: false, healthy: false, code, message, failure: { code, message } })
      } finally {
        clearTimeout(deadline)
      }
    },
  }
}

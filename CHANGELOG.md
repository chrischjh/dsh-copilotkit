# Changelog

## 0.2.5

- `/copilotkit/selfcheck` now applies the Host's connection checks: the handler first calls `ctx.connection.requestRejection({ headers })` (Host/Origin validation plus browser authentication) and returns 401/403 when the app itself would refuse the request. A `webServer.register` route otherwise has no DSH access check. The connection service is optional, so the route still works where it is absent.
- The catalog description no longer needs the "HTTP routes have no DSH access check" caveat (maintainer fkysly's review note on the market PR).

## 0.2.4

- The detail-page flow can now **repair version shadows**: when a profile-installed copy of `@deepseek-ai/dsh-mcp-client` shadows the DSH-shipped package at a different version, an explicit **Align & repair** button aligns the profile dependency using DSH's bundled node + pnpm (no store clashes), then asks for a full DSH restart.
- `copilotkit_selfcheck` reports the shadow versions; the agent tool stays read-only.

## 0.2.3

- Row ids are namespaced (`dsh-copilotkit`, `dsh-copilotkit-docs`) so they can no longer collide with other bundles' rows or stale overrides; repair still finds the pre-0.2.3 ids.
- Self-check detects a profile-installed `@deepseek-ai/dsh-mcp-client` that shadows the DSH-shipped copy at a different version (seen with `dsh-mcp-connector` pinning 0.2.1-rc.3 on DSH 0.2.2) and names the fix.

## 0.2.2

- README: the kit is introduced as a "CopilotKit developer knowledge connector"; the non-essential sections (cost/privacy, skill updates, development, publishing) moved out of the front page; the self-check sections are rewritten in plain language (English and Chinese).

## 0.2.1

- The plugin's own display name is **dsh-copilotkit**, not the official "CopilotKit" product name; the install section no longer points at the product name.
- README leads with what the kit provides and how to use it, followed by the DSH install steps.
- Clarified install specs: GitHub now, npm `dsh-copilotkit` once the npm release exists.

## 0.2.0

- Detail-page **Check & repair** button (`plugins.detail.section` → same-origin `POST /copilotkit/selfcheck`).
- Automatic repair through official APIs: retry skill discovery, enable a disabled `copilotkit-docs` row, restart a stale connection (`pluginManager.setPluginEnabled`); the reachability probe retries three times and a network blip never restarts the row.
- Failures reported the official way: plugin-manager `ManagementError` codes, Host log, inline error, and the standard `Toast` banner.
- `copilotkit_selfcheck` model-facing tool (read-only).
- Publishable package: `dsh-copilotkit` on npm/GitHub, `publishConfig`, market submission template, CI on macOS/Windows/Linux, release workflow, cross-platform asset paths.

## 0.1.0

- Official `copilotkit` and `copilotkit-cli` agent skills, vendored verbatim and pinned by `skills.lock.json`.
- `copilotkit` docs MCP server (`https://mcp.copilotkit.ai/mcp`) through `@deepseek-ai/dsh-mcp-client`, 7 tools.
- Short lookup-first system-prompt section; bilingual locale, icon, README.

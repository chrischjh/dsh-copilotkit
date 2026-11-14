# Changelog

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

# dsh-copilotkit · CopilotKit developer kit for DeepSeek Harness

[![npm](https://img.shields.io/npm/v/dsh-copilotkit)](https://www.npmjs.com/package/dsh-copilotkit)
[![CI](https://github.com/chrischjh/dsh-copilotkit/actions/workflows/ci.yml/badge.svg)](https://github.com/chrischjh/dsh-copilotkit/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-copilotkit)](LICENSE)

Official CopilotKit knowledge plus a self-checking bridge for DeepSeek Harness. The bundle installs the two official CopilotKit agent skills and the CopilotKit docs MCP server, adds one short lookup-first rule, and puts a **Check & repair** button on its detail page (plus a read-only agent tool) that verifies both halves and repairs a disabled or stale MCP row.

[中文](#中文)

## What you get

| Piece | Effect |
|---|---|
| `copilotkit` + `copilotkit-cli` skills | The agent looks up current docs / source / CLI instead of recalling APIs. Loaded implicitly when a task matches, or explicitly with `/copilotkit` / `/copilotkit-cli`. |
| 7 `mcp__copilotkit__*` tools | Live semantic search over CopilotKit docs, library source, AG-UI docs, and AG-UI source (`search-docs`, `search-code`, `search-ag-ui-docs`, `search-ag-ui-code`, `explore-docs`, `explore-code`, `submit-feedback`). |
| Self-check | `copilotkit_selfcheck` agent tool (read-only) and a **Check & repair** button on **Plugins → dsh-copilotkit**. The button enables or restarts the `copilotkit-docs` row through the official plugin manager and reports failures with its error codes. |
| Prompt section | One standing rule: for CopilotKit/AG-UI work, load the skill and take the API from the tools or docs before writing code. |

**How you use it:** ask CopilotKit questions normally — the agent loads the skill and searches while it works; `/copilotkit` forces the skill for one turn; name a tool when you want a specific lookup ("用 search-docs 查一下 useFrontendTool"). When something looks off, open **Plugins → dsh-copilotkit** and click **Check & repair**, or ask the agent to run `copilotkit_selfcheck` for a read-only report.

## Install in DSH

- **Plugin market / npm:** **Plugins → Discover** → CopilotKit, or **Add plugin** with the spec `dsh-copilotkit`. CLI form: `dsh plugin --profile <name> add dsh-copilotkit`.
- **GitHub:** the same dialog accepts `github:chrischjh/dsh-copilotkit` (or a release tarball URL).
- **Local development:** **Add plugin** → choose the cloned directory; it links the checkout.

Requires DSH >= 0.2.0-rc.2 and Node >= 20.3. The same package runs on macOS, Windows, and Linux; CI tests `ubuntu-latest`, `macos-latest`, and `windows-latest` with Node 20 and 22.

Verify after install: ask "use search-docs to look up useFrontendTool", check `<available_skills>` for the two entries, and find the two rows (`copilotkit`, `copilotkit-docs`) on the **Plugins** page. Each row can be disabled independently: `copilotkit` keeps only the MCP tools, `copilotkit-docs` keeps only the skills (they fall back to `https://docs.copilotkit.ai/<path>.md`).

## What it registers

| Piece | Source | Detail |
|---|---|---|
| `copilotkit`, `copilotkit-cli` | [CopilotKit/CopilotKit `skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills), vendored verbatim and pinned by `skills.lock.json` | Registered on `ctx.skills`; the DeepSeek Harness notes (exact tool names, do-not-hand-roll rule) are appended at registration only — the vendored files stay byte-identical to upstream |
| `copilotkit` MCP server | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp` | CopilotKit's own docs call it `copilotkit-docs`; the DSH server name here is `copilotkit`, so tools are `mcp__copilotkit__<tool>` |
| `copilotkit_selfcheck` | [lib/selfcheck.js](lib/selfcheck.js) | Read-only agent tool: both skills registered + discovery complete, 7/7 tools registered, live `initialize` + `tools/list` probe with latency |
| Check & repair button | [client.js](client.js), [lib/repair.js](lib/repair.js) | Same check on the Host, then repair: retry skill discovery, enable or restart the MCP row, retry the probe |
| Prompt section | [lib/prompt.js](lib/prompt.js) | Self-scoped reminder; contributes nothing when no CopilotKit surface is touched |

## Self-check and repair

The bundle's detail-page section (`plugins.detail.section`) posts to the Host's same-origin `/copilotkit/selfcheck` route. Repairs use only official DSH mechanisms:

- skills not registered or discovery incomplete → retries discovery;
- `copilotkit-docs` row disabled → `pluginManager.setPluginEnabled(entryId, true)`;
- row enabled but the connection went stale → restarts the row (disable, then enable), waiting for the 7 tools to re-register;
- server unreachable → the probe retries three times and a network blip **never** restarts the row; a persistent failure reports `mcp-unreachable` and points at the Markdown fallback.

Failures are not swallowed: the Host logs them, the response carries the plugin manager's own code (`management-required`, `unaddressable`, `operation-error`, …) or the check's code (`mcp-unreachable`, `skills-incomplete`), and the browser shows the code inline plus the standard `Toast` banner. The route accepts only same-origin POST + JSON.

## Cost and privacy

Two skill-catalog entries and one short prompt section are added per session; 7 MCP tool schemas are resident while `copilotkit-docs` is enabled. Docs queries go to CopilotKit's public MCP endpoint over HTTPS with no credentials. The CopilotKit CLI collects its own telemetry — `DO_NOT_TRACK=1` or `COPILOTKIT_TELEMETRY_DISABLED=1` opts out.

## Updating the vendored skills

```bash
pnpm run sync     # re-vendor from CopilotKit/CopilotKit@main and rewrite skills.lock.json
pnpm test
```

The lock records the upstream commit and SHA-256 of every vendored file; the tests fail loudly when a file drifts. `.gitattributes` pins LF so the hashes also hold on Windows checkouts.

## Development

```bash
pnpm test   # node --test, 26 tests across skills, probe, repair, and the HTTP route
```

## Publishing (maintainers)

1. Bump the version and commit: `npm version patch|minor` (update [CHANGELOG.md](CHANGELOG.md)).
2. Create the GitHub repository `chrischjh/dsh-copilotkit` (adjust `repository`, `homepage`, and `bugs` if the owner differs) and push `main`.
3. Add an `NPM_TOKEN` repository secret, then push a `v*` tag: [release.yml](.github/workflows/release.yml) tests, publishes to npm, and creates the GitHub release; [ci.yml](.github/workflows/ci.yml) checks every push/PR on three OSes.
4. Submit the market entry: PR [market/awesome-dsh-plugin.yml](market/awesome-dsh-plugin.yml) to [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) as `data/plugins/chrischjh__dsh-copilotkit.yml` (the repo must be public and at least one day old). Until it merges, users can add the shared index `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` in **Plugins → Discover → Index sources**.

## 中文

### dsh-copilotkit · DSH 的 CopilotKit 开发套件

把**官方 CopilotKit 知识**接进 DeepSeek Harness：内置两个官方 agent skill 与 copilotkit 文档 MCP 服务器，加一条"先查再写"的提示词，并在插件详情页提供一个**检查并修复**按钮（以及一个只读的 agent 自检工具）。

**你会得到什么**

| 内容 | 作用 |
|---|---|
| `copilotkit` + `copilotkit-cli` skill | 让智能体查最新文档 / 源码 / CLI，而不是凭记忆造 API；任务匹配时隐式加载，也可用 `/copilotkit`、`/copilotkit-cli` 显式加载 |
| 7 个 `mcp__copilotkit__*` 工具 | 对 CopilotKit 文档、库源码、AG-UI 文档与源码做实时语义检索 |
| 自检 | agent 工具 `copilotkit_selfcheck`（只读）+ **插件 → dsh-copilotkit** 详情页的**检查并修复**按钮；按钮经官方 plugin manager 启用或重启 `copilotkit-docs` 行，失败按其错误码上报 |
| 提示词小节 | 常驻一条守则：CopilotKit/AG-UI 任务先加载 skill、用工具或文档取 API 再写代码 |

**怎么用**：正常提问即可，智能体会边查边做；想强制加载 skill 就在消息里写 `/copilotkit`；想指定检索就点名工具（"用 search-docs 查一下 useFrontendTool"）。觉得不对劲时打开 **插件 → dsh-copilotkit** 点**检查并修复**，或让智能体跑 `copilotkit_selfcheck` 拿只读体检报告。

### 在 DSH 中安装

- **插件市场 / npm：** **插件 → 发现** 里找 CopilotKit，或在 **添加插件** 填 `dsh-copilotkit`；CLI 形式 `dsh plugin --profile <name> add dsh-copilotkit`。
- **GitHub：** 同一入口填 `github:chrischjh/dsh-copilotkit`（或 release 的 tarball 地址）。
- **本地开发：** **添加插件** → 选择克隆目录（链接安装）。

要求 DSH >= 0.2.0-rc.2、Node >= 20.3；macOS / Windows / Linux 通用，CI 覆盖三平台 × Node 20/22。

安装后验证：让智能体"用 search-docs 查一下 useFrontendTool"，看 `<available_skills>` 是否有两行，并在 **插件** 页确认 `copilotkit`、`copilotkit-docs` 两个行。两行可分别禁用：禁用 `copilotkit` 只留 MCP 工具；禁用 `copilotkit-docs` 只留 skill（回退到 `docs.copilotkit.ai/<path>.md`）。

### 修复与报错机制

详情页区块把请求发给 Host 的同源 `/copilotkit/selfcheck` 路由。修复全走官方 API：重试 skill 发现；`copilotkit-docs` 被禁用则 `pluginManager.setPluginEnabled` 启用；连接失效则禁用再启用重启并等待 7 个工具重新注册。服务器不可达时探测内置 3 次重试，**网络抖动不会误重启 MCP 行**；仍失败报 `mcp-unreachable` 并指向 Markdown 回退。失败不会被吞掉：Host 记录日志、响应带 plugin manager 的失败码或自检码，浏览器内联显示并弹官方 `Toast`；路由仅接受同源 POST + JSON。

### 成本、隐私、维护

每个会话新增两个 skill 目录项和一小段提示词，`copilotkit-docs` 启用时常驻 7 个工具 schema；文档查询匿名发送到 CopilotKit 公共端点。更新内置 skill：`pnpm run sync && pnpm test`（lock 固定上游 commit 与每个文件的 SHA-256；`.gitattributes` 固定 LF，Windows 下同样有效）。发布步骤见英文节 *Publishing (maintainers)*。

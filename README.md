# dsh-copilotkit · CopilotKit developer kit for DeepSeek Harness

[English](#english) · [中文](#中文)

## English

A DeepSeek Harness bundle that gives every agent the **official** CopilotKit developer kit, so CopilotKit work builds on the library instead of inventing APIs, re-implementing primitives, or hacking around the runtime.

### What it registers

| Piece | Source | Effect |
|---|---|---|
| `copilotkit` agent skill | [CopilotKit/CopilotKit `skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills), vendored verbatim and pinned in `skills.lock.json` | Appears in every session's skill catalog; teaches lookup-first: current docs (`.md` pages), library source, and the CLI |
| `copilotkit-cli` agent skill | same source | Drives `npx copilotkit@latest` — `verify` wiring checks before debugging, `onboard`, `typegen`, and more |
| `copilotkit` MCP server | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp` (CopilotKit's official docs MCP; CopilotKit's own docs call the server `copilotkit-docs`, the DSH server name here is `copilotkit`) | 7 tools when connected: `search-docs`, `search-code`, `search-ag-ui-docs`, `search-ag-ui-code`, `explore-docs`, `explore-code`, `submit-feedback`, exposed as `mcp__copilotkit__<tool>` |
| Prompt section | this bundle | One short self-scoped reminder: load the `copilotkit` skill and take the API from the MCP tools / docs before writing CopilotKit code; run `copilotkit verify` first when wiring is broken |

The vendored skill files stay byte-identical to upstream; the DeepSeek Harness specific notes (exact tool names, the do-not-hand-roll rule) are appended at registration time only.

### How it is used — nothing hidden

Installing this bundle is equivalent to installing the official CopilotKit skills and the docs MCP server into DSH. Here is exactly how each piece gets invoked:

**Skills — implicit by default, explicit on demand.** Every session's skill catalog (`<available_skills>` in the conversation) lists `copilotkit` and `copilotkit-cli` as one-line summaries. When your task matches a description — asking how to add CopilotKit, build a feature, or fix a broken app — the agent itself calls the `skill` tool to load the full instructions before writing code. You don't need to do anything. To invoke one explicitly, put a leading token in your message: `/copilotkit` or `/copilotkit-cli` (DSH's user-invocation gesture injects the full text into that turn), or just say "load the copilotkit skill first". What gets loaded is the upstream skill verbatim plus one appended "In DeepSeek Harness" section — readable in [skills/](skills/); nothing else is rewritten.

**MCP tools — invoked like native tools.** The 7 tools sit in the agent's tool list as `mcp__copilotkit__search-docs`, `mcp__copilotkit__search-code`, `mcp__copilotkit__search-ag-ui-docs`, `mcp__copilotkit__search-ag-ui-code`, `mcp__copilotkit__explore-docs`, `mcp__copilotkit__explore-code`, `mcp__copilotkit__submit-feedback`. Typical use is implicit: the agent searches while working because the skill instructs it to. You can also name one explicitly, e.g. "用 search-docs 查一下 useFrontendTool" or "search code for CopilotRuntime factories". Every call is a live semantic search against CopilotKit's public endpoint (docs / library source / AG-UI docs / AG-UI source); `explore-*` browses those trees when you don't know what to search for; `submit-feedback` rates a search.

**Prompt section — a standing rule, not a tool.** One short paragraph in the system prompt tells the agent, for CopilotKit/AG-UI work, to load the skill and take the API from these tools or the docs pages before writing code. It triggers nothing by itself.

**Confirm it works — incl. a built-in self-check.** Run `copilotkit_selfcheck` (or ask "self-check the CopilotKit kit"). It returns one read-only health report: both skills registered and skill discovery complete, how many of the 7 MCP tools are registered in this DSH, and whether the docs server answers a live `initialize` + `tools/list` probe, with latency. Manual checks still work: ask for a search-docs lookup, look for the two entries in `<available_skills>`, and find the two rows (`copilotkit`, `copilotkit-docs`) on the **Plugins** page.

**The detail-page button repairs.** Open **Plugins → dsh-copilotkit**: a *CopilotKit self-check* section carries a **Check & repair** button. It re-runs the same checks on the Host and, when something is wrong, repairs through official DSH mechanisms:

- skills not registered or discovery incomplete → retries skill discovery;
- `copilotkit-docs` row disabled → enables it through the plugin manager's `setPluginEnabled`;
- row enabled but the connection went stale → restarts the row (disable, then enable) and waits for the 7 tools to re-register;
- server unreachable → not "fixed": the report names `mcp-unreachable` and points at the `docs.copilotkit.ai/<path>.md` fallback.

Any refusal or failure is reported the official way, not swallowed: the Host logs it, the response carries the plugin manager's own failure code (`management-required`, `unaddressable`, `operation-error`, …, or the self-check's `mcp-unreachable` / `skills-incomplete`), and the browser shows it both inline (code + message) and through the standard `Toast` banner. The route is same-origin, POST + JSON only, so other origins cannot trigger it.

**What DSH itself already checks (no black box).** The Plugins page shows every row's activation state — active, failed (with its diagnostic and **Retry**), overridden, or restart-required. Skill discovery reports its own incompleteness: when a provider fails, the catalog message says "Some skills could not be checked" and discovery retries on the next request. The MCP client reconnects with exponential backoff, keeps the last known tools listed during an outage (calls fail), and removes the tools after 10 consecutive failed attempts. Settings-driven servers added through `dsh-mcp-manager` additionally expose status, restart, and probe. `copilotkit_selfcheck` combines the skill and MCP facts into one model-callable answer.

### Install

DeepSeek Harness → **Plugins** → **Add plugin**, pointing at this directory (or `plugin_manager` `install_bundle` with the absolute directory as `target`).

Verify after install: ask the agent "use search-docs to look up useFrontendTool" or run any CopilotKit task — the skills appear in `<available_skills>` and `mcp__copilotkit__*` tools in the tool list.

### Disable pieces independently

Both patch rows are independently toggleable from **Plugins**:

- Disable `copilotkit-docs` → keep the skills; the skill falls back to fetching `https://docs.copilotkit.ai/<path>.md`.
- Disable `copilotkit` → keep only the MCP tools.

Degraded mode: if the docs server is unreachable at startup or the connection drops, the plugin row stays enabled but the `mcp__copilotkit__*` tools are absent (a diagnostic is logged). The prompt section and both skills tell the agent about that fallback, so lookups continue through the Markdown pages.

### Cost and privacy

- Two skill-catalog lines and one prompt section are added to every session in this profile; 7 MCP tool schemas are resident while `copilotkit-docs` is enabled.
- Docs searches go to CopilotKit's public MCP endpoint over HTTPS with no credentials. The CopilotKit CLI collects its own telemetry — `DO_NOT_TRACK=1` or `COPILOTKIT_TELEMETRY_DISABLED=1` opts out.

### Updating the vendored skills

```bash
pnpm run sync     # re-vendor from CopilotKit/CopilotKit@main and rewrite skills.lock.json
pnpm test
```

The lock records the upstream commit and SHA-256 of every vendored file; the tests fail loudly when a vendored file drifts from the lock.

### Development

```bash
pnpm test   # node --test test/
```

## 中文

一个 DeepSeek Harness 插件包，为每个会话装上**官方**的 CopilotKit 开发套件：让智能体基于库本身开发，而不是自造轮子、自己 hack。

### 注册了什么

| 内容 | 来源 | 效果 |
|---|---|---|
| `copilotkit` agent skill | [CopilotKit/CopilotKit `skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills) 原样内置，由 `skills.lock.json` 锁定 | 出现在每个会话的 skill 目录；教会"先查再写"：最新文档（`.md` 页面）、库源码、CLI |
| `copilotkit-cli` agent skill | 同上 | 驱动 `npx copilotkit@latest`：先 `verify` 验证接线再排障、`onboard`、`typegen` 等 |
| `copilotkit` MCP 服务器 | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp`（CopilotKit 官方文档 MCP；上游文档称其为 `copilotkit-docs`，本插件里 DSH 服务器名为 `copilotkit`） | 连接成功后提供 7 个工具：`search-docs`、`search-code`、`search-ag-ui-docs`、`search-ag-ui-code`、`explore-docs`、`explore-code`、`submit-feedback`，名称为 `mcp__copilotkit__<tool>` |
| 提示词小节 | 本插件 | 一小段自我限定的提醒：写 CopilotKit 代码前先加载 `copilotkit` skill、用 MCP 工具或文档取当前 API；怀疑接线坏了先跑 `copilotkit verify` |

内置的 skill 文件与上游逐字节一致；DeepSeek Harness 特有说明（确切工具名、"不要手搓替代品"规则）只在注册时追加。

### 怎么用 —— 没有黑盒

安装本插件 ≈ 把官方 CopilotKit skills 和 docs MCP 服务器装进 DSH。各部分如何被调用：

**Skill —— 默认隐式，也可显式。** 每个会话开始时，会话里的 skill 目录（`<available_skills>`）会列出 `copilotkit`、`copilotkit-cli` 两行摘要。当任务与描述匹配（问怎么接 CopilotKit、做功能、排查报错……），智能体会自己调用 `skill` 工具加载全文再动手——你无需做任何事。要显式触发：在消息开头写 `/copilotkit` 或 `/copilotkit-cli`（DSH 的用户调用手势，会把全文注入该回合），或者直接说"先加载 copilotkit skill"。加载的内容 = 上游原文 + 一段"在 DeepSeek Harness 中使用"附言，可在 [skills/](skills/) 目录直接查看，没有别的改写。

**MCP 工具 —— 和原生工具一样被调用。** 7 个工具以 `mcp__copilotkit__search-docs`、`mcp__copilotkit__search-code`、`mcp__copilotkit__search-ag-ui-docs`、`mcp__copilotkit__search-ag-ui-code`、`mcp__copilotkit__explore-docs`、`mcp__copilotkit__explore-code`、`mcp__copilotkit__submit-feedback` 出现在智能体的工具表里。通常是隐式使用：skill 指示它边干边查。也可以点名显式调用，例如"用 search-docs 查一下 useFrontendTool"或"search code for CopilotRuntime factories"。每次调用都是对 CopilotKit 公共端点的实时语义检索（产品文档 / 库源码 / AG-UI 文档 / AG-UI 源码）；不知道搜什么时用 `explore-*` 浏览目录；`submit-feedback` 用于给检索结果打分。

**提示词小节 —— 是守则，不是工具。** 系统提示里常驻一小段：CopilotKit/AG-UI 相关任务先加载 skill、用上述工具或文档页取当前 API 再写代码。它本身不触发任何调用。

**确认生效（含内置自检）。** 调用 `copilotkit_selfcheck`（或说"自检一下 CopilotKit 套件"）即可得到一次只读体检：两个 skill 是否注册、skill 发现是否完整、7 个 MCP 工具在本 DSH 里注册了几个、文档服务器是否响应实时 `initialize` + `tools/list` 探测（含延迟）。手工核对：让智能体用 search-docs 查一次、看 `<available_skills>` 里是否有两行、在 **插件** 页确认 `copilotkit`、`copilotkit-docs` 两个行。

**详情页按钮会直接修复。** 打开 **插件 → dsh-copilotkit**，详情页里有一个 *CopilotKit 自检* 区块和 **检查并修复** 按钮。它在 Host 侧重跑同一套检查，发现问题时通过 DSH 官方机制修复：

- skill 未注册或发现不完整 → 重试 skill 发现；
- `copilotkit-docs` 行被禁用 → 经 plugin manager 的 `setPluginEnabled` 启用；
- 行已启用但连接失效 → 重启该行（先禁用再启用），等待 7 个工具重新注册；
- 服务器不可达 → 不做"假修复"：报告 `mcp-unreachable`，并指向 `docs.copilotkit.ai/<path>.md` 回退。

任何拒绝或失败都按官方方式报出，不会被吞掉：Host 记录日志，响应携带 plugin manager 自己的失败码（`management-required`、`unaddressable`、`operation-error` 等，或自检的 `mcp-unreachable` / `skills-incomplete`），浏览器同时以内联文字（错误码 + 消息）和标准 `Toast` 横幅显示。该路由仅接受同源、POST + JSON，其他来源无法触发。

**DSH 原生已有的健康信号（不是黑盒）。** 插件页显示每一行的激活状态：active、failed（附诊断与 **Retry**）、overridden、restart-required。skill 发现会自报不完整：某个 provider 失败时，会话里的 skill 目录消息会显示 "Some skills could not be checked"，并在下一次请求重试。MCP 客户端按指数退避自动重连；断线期间保留最后已知的工具（调用会失败），连续 10 次失败后移除工具。经 `dsh-mcp-manager` 接入的、由设置驱动的服务器还会提供 status、restart、probe。`copilotkit_selfcheck` 则把 skill 与 MCP 的事实合并成一次模型可调用的体检结果。

### 安装

DeepSeek Harness → **插件** → **添加插件**，选择本目录（或用 `plugin_manager` `install_bundle`，`target` 填绝对目录）。安装后可让智能体"用 search-docs 查一下 useFrontendTool"验证。

### 按需关闭

- 禁用 `copilotkit-docs` 行 → 只保留 skill（skill 会退回抓取 `https://docs.copilotkit.ai/<path>.md`）。
- 禁用 `copilotkit` 行 → 只保留 MCP 工具。

降级模式：文档服务器启动时不可达或连接中断时，插件行保持启用但 `mcp__copilotkit__*` 工具缺席（会记录诊断日志）。提示词小节与两个 skill 都向智能体说明了该回退，检索会继续走 Markdown 页面。

### 成本与隐私

- 每个会话新增两行 skill 目录、一小段提示词；`copilotkit-docs` 启用时常驻 7 个 MCP 工具 schema。
- 文档搜索经 HTTPS 匿名发送到 CopilotKit 公共端点，无需凭证。CopilotKit CLI 自身会收集遥测，`DO_NOT_TRACK=1` 可关闭。

### 更新内置 skill

```bash
pnpm run sync   # 从 CopilotKit/CopilotKit@main 重新拉取并重写 skills.lock.json
pnpm test
```

### 许可

本插件代码 MIT；内置 skill 文件来自 CopilotKit（MIT，见 NOTICE）。

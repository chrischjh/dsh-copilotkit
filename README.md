# dsh-copilotkit · CopilotKit developer kit for DeepSeek Harness

[English](#english) · [中文](#中文)

## English

A DeepSeek Harness bundle that gives every agent the **official** CopilotKit developer kit, so CopilotKit work builds on the library instead of inventing APIs, re-implementing primitives, or hacking around the runtime.

### What it registers

| Piece | Source | Effect |
|---|---|---|
| `copilotkit` agent skill | [CopilotKit/CopilotKit `skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills), vendored verbatim and pinned in `skills.lock.json` | Appears in every session's skill catalog; teaches lookup-first: current docs (`.md` pages), library source, and the CLI |
| `copilotkit-cli` agent skill | same source | Drives `npx copilotkit@latest` — `verify` wiring checks before debugging, `onboard`, `typegen`, and more |
| `copilotkit` MCP server | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp` (CopilotKit's official docs MCP) | 7 tools: `search-docs`, `search-code`, `search-ag-ui-docs`, `search-ag-ui-code`, `explore-docs`, `explore-code`, `submit-feedback`, exposed as `mcp__copilotkit__<tool>` |
| Prompt section | this bundle | One short self-scoped reminder: load the `copilotkit` skill and take the API from the MCP tools / docs before writing CopilotKit code; run `copilotkit verify` first when wiring is broken |

The vendored skill files stay byte-identical to upstream; the DeepSeek Harness specific notes (exact tool names, the do-not-hand-roll rule) are appended at registration time only.

### Install

DeepSeek Harness → **Plugins** → **Add plugin**, pointing at this directory (or `plugin_manager` `install_bundle` with the absolute directory as `target`).

Verify after install: ask the agent "use search-docs to look up useFrontendTool" or run any CopilotKit task — the skills appear in `<available_skills>` and `mcp__copilotkit__*` tools in the tool list.

### Disable pieces independently

Both patch rows are independently toggleable from **Plugins**:

- Disable `copilotkit-docs` → keep the skills; the skill falls back to fetching `https://docs.copilotkit.ai/<path>.md`.
- Disable `copilotkit` → keep only the MCP tools.

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
| `copilotkit` MCP 服务器 | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp`（CopilotKit 官方文档 MCP） | 7 个工具：`search-docs`、`search-code`、`search-ag-ui-docs`、`search-ag-ui-code`、`explore-docs`、`explore-code`、`submit-feedback`，名称为 `mcp__copilotkit__<tool>` |
| 提示词小节 | 本插件 | 一小段自我限定的提醒：写 CopilotKit 代码前先加载 `copilotkit` skill、用 MCP 工具或文档取当前 API；怀疑接线坏了先跑 `copilotkit verify` |

内置的 skill 文件与上游逐字节一致；DeepSeek Harness 特有说明（确切工具名、"不要手搓替代品"规则）只在注册时追加。

### 安装

DeepSeek Harness → **插件** → **添加插件**，选择本目录（或用 `plugin_manager` `install_bundle`，`target` 填绝对目录）。安装后可让智能体"用 search-docs 查一下 useFrontendTool"验证。

### 按需关闭

- 禁用 `copilotkit-docs` 行 → 只保留 skill（skill 会退回抓取 `https://docs.copilotkit.ai/<path>.md`）。
- 禁用 `copilotkit` 行 → 只保留 MCP 工具。

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

# dsh-copilotkit · CopilotKit developer kit for DeepSeek Harness

[![npm](https://img.shields.io/npm/v/dsh-copilotkit)](https://www.npmjs.com/package/dsh-copilotkit)
[![CI](https://github.com/chrischjh/dsh-copilotkit/actions/workflows/ci.yml/badge.svg)](https://github.com/chrischjh/dsh-copilotkit/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-copilotkit)](LICENSE)

CopilotKit developer knowledge connector plus a self-checking bridge for DeepSeek Harness. The bundle installs the two official CopilotKit agent skills and the CopilotKit docs MCP server, adds one short lookup-first rule, and puts a **Check & repair** button on its detail page (plus a read-only agent tool) that verifies both halves and repairs a disabled or stale MCP row.

[中文](#中文)

## What you get

| Piece | Effect |
|---|---|
| `copilotkit` + `copilotkit-cli` skills | The agent looks up current docs / source / CLI instead of recalling APIs. Loaded implicitly when a task matches, or explicitly with `/copilotkit` / `/copilotkit-cli`. |
| 7 `mcp__copilotkit__*` tools | Live semantic search over CopilotKit docs, library source, AG-UI docs, and AG-UI source. |
| Self-check | A read-only agent tool (`copilotkit_selfcheck`) and a **Check & repair** button on **Plugins → dsh-copilotkit** that check everything and fix what can be fixed. |
| Prompt section | One standing rule: for CopilotKit/AG-UI work, load the skill and take the API from the tools or docs before writing code. |

**How you use it:** ask CopilotKit questions normally — the agent loads the skill and searches while it works; `/copilotkit` forces the skill for one turn; name a tool when you want a specific lookup ("用 search-docs 查一下 useFrontendTool"). When something looks off, open **Plugins → dsh-copilotkit** and click **Check & repair**, or ask the agent to run `copilotkit_selfcheck` for a text report.

## Install in DSH

- **GitHub (available now):** **Add plugin** → `github:chrischjh/dsh-copilotkit`. CLI: `dsh plugin --profile <name> add github:chrischjh/dsh-copilotkit`.
- **npm / plugin market (after the npm release):** the package is `dsh-copilotkit`; CLI form `dsh plugin --profile <name> add dsh-copilotkit`.
- **Local development:** **Add plugin** → choose the cloned directory; it links the checkout.

Requires DSH >= 0.2.0-rc.2 and Node >= 20.3. The same package runs on macOS, Windows, and Linux; CI tests `ubuntu-latest`, `macos-latest`, and `windows-latest` with Node 20 and 22.

Verify after install: ask "use search-docs to look up useFrontendTool", check `<available_skills>` for the two entries, and find the two rows (`copilotkit`, `copilotkit-docs`) on the **Plugins** page. Each row can be disabled independently: `copilotkit` keeps only the MCP tools, `copilotkit-docs` keeps only the skills (they fall back to `https://docs.copilotkit.ai/<path>.md`).

## What it registers

| Piece | Source | Detail |
|---|---|---|
| `copilotkit`, `copilotkit-cli` | [CopilotKit/CopilotKit `skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills), vendored verbatim and pinned by `skills.lock.json` | Registered on `ctx.skills`; the DeepSeek Harness notes (exact tool names, do-not-hand-roll rule) are appended at registration only — the vendored files stay byte-identical to upstream |
| `copilotkit` MCP server | `@deepseek-ai/dsh-mcp-client` → `https://mcp.copilotkit.ai/mcp` | CopilotKit's own docs call it `copilotkit-docs`; the DSH server name here is `copilotkit`, so tools are `mcp__copilotkit__<tool>` |
| `copilotkit_selfcheck` | [lib/selfcheck.js](lib/selfcheck.js) | Read-only agent tool: both skills registered + discovery complete, 7/7 tools registered, live `initialize` + `tools/list` probe with latency |
| Check & repair button | [client.js](client.js) + [lib/repair.js](lib/repair.js) | The same check runs on the Host, then it repairs what it can (see the next section) |
| Prompt section | [lib/prompt.js](lib/prompt.js) | Self-scoped reminder; contributes nothing when no CopilotKit surface is touched |

## Self-check and repair

Open **Plugins → dsh-copilotkit** and click **Check & repair**. Within a few seconds it reports three plain facts:

- are both skills installed;
- are the 7 docs-search tools connected;
- can the docs server be reached.

If something is wrong, it fixes what can be fixed by itself: a switched-off connection is switched back on, a stuck connection is restarted, and it waits until the tools are back. What it cannot fix — usually the network — it says plainly, with the exact problem, instead of pretending success. Asking the agent to run `copilotkit_selfcheck` returns the same report as text.

## 中文

### dsh-copilotkit · DSH 的 CopilotKit 开发套件

**CopilotKit 开发者知识连接器** + 自检桥，接入 DeepSeek Harness：内置两个官方 CopilotKit agent skill 和 CopilotKit 文档 MCP 服务器，加一条"先查再写"的提示词，并在插件详情页提供**检查并修复**按钮（以及一个只读的 agent 自检工具）。

**你会得到什么**

| 内容 | 作用 |
|---|---|
| `copilotkit` + `copilotkit-cli` skill | 让智能体查最新文档 / 源码 / CLI，而不是凭记忆造 API；任务匹配时隐式加载，也可用 `/copilotkit`、`/copilotkit-cli` 显式加载 |
| 7 个 `mcp__copilotkit__*` 工具 | 对 CopilotKit 文档、库源码、AG-UI 文档与源码做实时语义检索 |
| 自检 | 只读 agent 工具 `copilotkit_selfcheck` + 详情页的**检查并修复**按钮：自动检查两项配置，能修的自动修 |
| 提示词小节 | 常驻一条守则：CopilotKit/AG-UI 任务先加载 skill、用工具或文档取 API 再写代码 |

**怎么用**：正常提问即可，智能体会边查边做；想强制加载 skill 就在消息里写 `/copilotkit`；想指定检索就点名工具（"用 search-docs 查一下 useFrontendTool"）。觉得不对劲时打开 **插件 → dsh-copilotkit** 点**检查并修复**，或让智能体跑 `copilotkit_selfcheck` 拿文字报告。

### 在 DSH 中安装

- **GitHub（当前可用）：** **添加插件** → `github:chrischjh/dsh-copilotkit`；CLI：`dsh plugin --profile <name> add github:chrischjh/dsh-copilotkit`。
- **npm / 插件市场（npm 发布后）：** 包名 `dsh-copilotkit`；CLI 形式 `dsh plugin --profile <name> add dsh-copilotkit`。
- **本地开发：** **添加插件** → 选择克隆目录（链接安装）。

要求 DSH >= 0.2.0-rc.2、Node >= 20.3；macOS / Windows / Linux 通用，CI 覆盖三平台 × Node 20/22。

安装后验证：让智能体"用 search-docs 查一下 useFrontendTool"，看 `<available_skills>` 是否有两行，并在 **插件** 页确认 `copilotkit`、`copilotkit-docs` 两个行。两行可分别禁用：禁用 `copilotkit` 只留 MCP 工具；禁用 `copilotkit-docs` 只留 skill（回退到 `docs.copilotkit.ai/<path>.md`）。

### 自检与修复

打开 **插件 → dsh-copilotkit**，点 **检查并修复**，几秒钟内它会告诉你三件实际的事：

- 两个 skill 装了没有；
- 7 个文档检索工具连上了没有；
- 文档服务器通不通。

发现问题会自动修：连接被关了就帮你打开，连接卡住了就重启并等到工具恢复；修不好的（多半是网络问题）也会直说哪里坏了，不会假装成功。让智能体运行 `copilotkit_selfcheck`，拿到的就是同一份文字报告。

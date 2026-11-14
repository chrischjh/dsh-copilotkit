// The model-facing guardrail section contributed to the system prompt.
//
// Skills are only discovered when their catalog entry matches the task; this
// short section makes the lookup-first rule explicit for CopilotKit work in
// every session, and scopes itself away when no CopilotKit surface is touched.

export const SECTION_NAME = 'copilotkit:workflow'
export const SECTION_ORDER = 3101 // right after the MCP_SERVERS section (3100)

export const SECTION_TEXT = [
  'When a task touches CopilotKit or AG-UI — any `@copilotkit/*` import, `.copilotkit/` state, CopilotRuntime or CopilotKitProvider wiring, or an agent framework connected through CopilotKit — load the `copilotkit` skill before writing or changing code, and take the current API from the `mcp__copilotkit__*` search tools (configured by the dsh-copilotkit bundle) or the docs Markdown pages instead of recalling or guessing; when those tools are absent, fetch `https://docs.copilotkit.ai/<path>.md`.',
  'Prefer existing CopilotKit primitives and official integration patterns; do not re-implement what the library already provides and do not patch its internals or the runtime to force behavior.',
  'When wiring is suspected broken, load the `copilotkit-cli` skill and run its `verify` form before debugging by hand.',
].join('\n\n')

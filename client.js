// dsh-copilotkit · browser half.
//
// Adds one section to this bundle's Plugins detail page (`plugins.detail.section`
// is rendered with the open page's subject). The button posts to the Host's
// same-origin `/copilotkit/selfcheck` route, which re-checks skills + MCP,
// repairs the MCP row through the official plugin manager, and reports any
// remaining failure. Refusals and errors surface through the official Toast
// primitive (the same transient banner the rest of the UI uses), and the
// section keeps the full failure code and message visible.

window.__ModuleLoader__.load({
  id: 'dsh-copilotkit',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    const { Button, Toast, IconCheckOutlineRegular, IconRefreshOutlineRegular, IconWarningOutlineRegular } = primitives
    const PACKAGE = 'dsh-copilotkit'
    const ENDPOINT = '/copilotkit/selfcheck'
    const NS = 'copilotkit'
    const CORE_SKILLS = 2
    const MCP_TOOLS = 7

    const DICT = {
      zh: {
        'section.title': 'CopilotKit 自检',
        'section.desc': '检查两个 skill 是否注册、7 个 MCP 工具是否就绪、文档服务器是否可达；发现问题会自动重启 copilotkit-docs 连接。',
        'button.run': '检查并修复',
        'button.again': '再查一次',
        'button.running': '检查中…',
        'status.healthy': '健康',
        'status.degraded': '异常',
        'line.skills': 'Skills：{a}/{total} 已注册',
        'line.discoveryComplete': 'skill 发现：完整',
        'line.discoveryIncomplete': 'skill 发现：不完整',
        'line.tools': 'MCP 工具：{n}/{total} 已注册',
        'line.serverOk': '文档服务器：可达（{name}，{tools} 个工具，{ms} 毫秒）',
        'line.serverFail': '文档服务器：不可达（{error}）',
        'actions.title': '已尝试的修复',
        'actions.none': '无需修复',
        'action.enable-row': '启用 copilotkit-docs 行',
        'action.restart-row': '重启 copilotkit-docs 连接',
        'action.retry-probe': '重试探测文档服务器',
        'action.retry-skill-discovery': '重试 skill 发现',
        'failure.title': '自检失败',
        'failure.code': '错误码',
        'checkedAt': '检查于 {time}',
        'toast.fail': 'CopilotKit 自检失败：{message}',
        'toast.problem': 'CopilotKit 自检发现问题：{message}',
      },
      en: {
        'section.title': 'CopilotKit self-check',
        'section.desc': 'Checks both skills, the 7 MCP tools, and the docs server; a problem restarts the copilotkit-docs connection automatically.',
        'button.run': 'Check & repair',
        'button.again': 'Check again',
        'button.running': 'Checking…',
        'status.healthy': 'Healthy',
        'status.degraded': 'Problem',
        'line.skills': 'Skills: {a}/{total} registered',
        'line.discoveryComplete': 'Skill discovery: complete',
        'line.discoveryIncomplete': 'Skill discovery: incomplete',
        'line.tools': 'MCP tools: {n}/{total} registered',
        'line.serverOk': 'Docs server: reachable ({name}, {tools} tools, {ms} ms)',
        'line.serverFail': 'Docs server: unreachable ({error})',
        'actions.title': 'Repair attempts',
        'actions.none': 'Nothing to repair',
        'action.enable-row': 'enable the copilotkit-docs row',
        'action.restart-row': 'restart the copilotkit-docs connection',
        'action.retry-probe': 'retry the docs server probe',
        'action.retry-skill-discovery': 'retry skill discovery',
        'failure.title': 'Self-check failed',
        'failure.code': 'Error code',
        'checkedAt': 'Checked at {time}',
        'toast.fail': 'CopilotKit self-check failed: {message}',
        'toast.problem': 'CopilotKit self-check found a problem: {message}',
      },
    }

    const S = {
      section: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-md, 8px)',
        background: 'var(--dsw-alias-bg-layer-1)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
      title: { margin: 0, fontSize: '14px', fontWeight: 600, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' },
      desc: { margin: '4px 0 0', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', maxWidth: '560px' },
      statusRow: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, lineHeight: '20px' },
      lines: { display: 'flex', flexDirection: 'column', gap: '2px' },
      line: { fontSize: '12px', lineHeight: '19px', color: 'var(--dsw-alias-label-secondary)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px' },
      actions: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
      chip: {
        fontSize: '11px',
        lineHeight: '18px',
        padding: '0 8px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      failure: {
        border: '1px solid var(--dsw-alias-state-error-primary)',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      },
      failureTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-state-error-primary)' },
      failureBody: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', margin: 0 },
      errorText: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)', margin: 0 },
      checked: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' },
    }

    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (params && params[key] !== undefined ? String(params[key]) : match))
    }

    function createSection(ctx) {
      return function SelfCheckSection(props) {
      const subject = props && props.subject
      const visible = subject !== undefined && subject.kind === 'bundle' && subject.pkg !== undefined && subject.pkg.name === PACKAGE
      const [running, setRunning] = React.useState(false)
      const [result, setResult] = React.useState(undefined)
      const [error, setError] = React.useState(undefined)
      const [toast, setToast] = React.useState(undefined)
      const [locale, setLocale] = React.useState(() => ctx.locale.getSnapshot().active)

      React.useEffect(() => ctx.locale.subscribe(() => setLocale(ctx.locale.getSnapshot().active)), [])
      if (!visible) return null

      const t = ctx.locale.bind(NS)
      const tr = (key, params) => {
        const text = t(key, params)
        return text === undefined || text === key ? format(DICT.en[key] ?? key, params) : text
      }

      async function run() {
        setRunning(true)
        setError(undefined)
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}',
          })
          const payload = await response.json().catch(() => undefined)
          if (!response.ok) {
            const message = payload && (payload.failure ? payload.failure.message : payload.message) || `HTTP ${response.status}`
            const code = payload && (payload.failure ? payload.failure.code : payload.code)
            const text = message
            setError(code ? `${code}: ${text}` : text)
            setToast({ text: tr('toast.fail', { message: text }), seq: Date.now() })
            return
          }
          setResult(payload)
          if (!payload.ok) {
            setToast({ text: tr('toast.problem', { message: payload.failure ? payload.failure.message : tr('status.degraded') }), seq: Date.now() })
          }
        } catch (failure) {
          const message = failure && failure.message ? failure.message : String(failure)
          setError(message)
          setToast({ text: tr('toast.fail', { message }), seq: Date.now() })
        } finally {
          setRunning(false)
        }
      }

      function actionLabel(action) {
        const key = `action.${action.action}`
        const name = tr(key)
        if (name !== key) return name
        const base = format(DICT.en[key] ?? action.action, {})
        return action.step === undefined ? base : `${base} (${action.step})`
      }

      const skills = result && result.skills
      const mcp = result && result.mcp
      const registeredSkills = skills ? (skills.copilotkit ? 1 : 0) + (skills['copilotkit-cli'] ? 1 : 0) : 0

      return h('section', { style: S.section, 'data-copilotkit-selfcheck': '' },
        h('div', { style: S.header },
          h('div', null,
            h('h4', { style: S.title }, tr('section.title')),
            h('p', { style: S.desc }, tr('section.desc')),
          ),
          h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: running,
            icon: h(IconRefreshOutlineRegular, { size: 13 }),
            onClick: run,
          }, running ? tr('button.running') : result === undefined ? tr('button.run') : tr('button.again')),
        ),

        result === undefined ? null : h('div', { style: S.lines },
          h('div', { style: { ...S.statusRow, color: result.healthy ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } },
            h(result.healthy ? IconCheckOutlineRegular : IconWarningOutlineRegular, { size: 14 }),
            result.healthy ? tr('status.healthy') : tr('status.degraded')),
          h('div', { style: S.line }, tr('line.skills', { a: registeredSkills, total: CORE_SKILLS })),
          h('div', { style: S.line }, tr(skills.complete ? 'line.discoveryComplete' : 'line.discoveryIncomplete')),
          h('div', { style: S.line }, tr('line.tools', { n: mcp.registeredTools, total: MCP_TOOLS })),
          h('div', { style: S.line },
            mcp.server.ok
              ? tr('line.serverOk', { name: mcp.server.server, tools: mcp.server.tools, ms: mcp.server.latencyMs })
              : tr('line.serverFail', { error: mcp.server.error })),
          h('div', { style: { ...S.line, ...S.chip, alignSelf: 'flex-start' } },
            tr('actions.title'), ': ',
            (result.actions && result.actions.length > 0)
              ? result.actions.map(actionLabel).join(' / ')
              : tr('actions.none')),
          h('div', { style: S.checked }, tr('checkedAt', { time: new Date(result.checkedAt).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US') })),
        ),

        error === undefined ? null : h('p', { style: S.errorText }, error),

        result !== undefined && !result.ok && result.failure !== undefined
          ? h('div', { style: S.failure },
            h('span', { style: S.failureTitle }, tr('failure.title')),
            h('span', { style: { ...S.failureBody, ...S.mono } }, `${tr('failure.code')}: ${result.failure.code}`),
            h('p', { style: S.failureBody }, result.failure.message),
          )
          : null,

        toast === undefined ? null : h(Toast, {
          key: toast.seq,
          text: toast.text,
          icon: h(IconWarningOutlineRegular, { size: 16 }),
          holdMs: 5000,
          onDone: () => setToast(undefined),
        }),
        )
      }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }))
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
        name: 'plugins.detail.section',
        id: 'copilotkit-selfcheck',
        order: 20,
        label: () => ctx.locale.bind(NS)('section.title'),
      }, createSection(ctx)))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})

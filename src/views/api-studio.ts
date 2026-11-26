import { SITE_CONFIG } from '../site-config.ts';
import type { PushEvent, SiteData, StudioEntry } from '../types.ts';
import {
  type CodeLang,
  copyToClipboard,
  esc,
  generateCodeSnippet,
  highlightJson,
  showToast,
} from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

const ENV_KEY = 'panette-studio-env';
const HIST_KEY = 'panette-studio-history';

interface EnvState {
  baseUrl: string;
  wsUrl: string;
  token: string;
}

interface HistoryEntry {
  id: string;
  label: string;
  body: string;
  ok: boolean;
  ms: number;
  at: string;
}

function loadEnv(): EnvState {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EnvState>;
      return {
        baseUrl: parsed.baseUrl || SITE_CONFIG.defaults.onebotBaseUrl,
        wsUrl: parsed.wsUrl || SITE_CONFIG.defaults.onebotWsUrl,
        token: parsed.token || '',
      };
    }
  } catch {
    /* ignore */
  }
  return {
    baseUrl: SITE_CONFIG.defaults.onebotBaseUrl,
    wsUrl: SITE_CONFIG.defaults.onebotWsUrl,
    token: '',
  };
}

function saveEnv(env: EnvState): void {
  try {
    localStorage.setItem(ENV_KEY, JSON.stringify(env));
  } catch {
    /* ignore */
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

type KindFilter = 'all' | 'action' | 'event' | 'http';
type CenterTab = 'doc' | 'debug';
type ProtoView = 'http' | 'ws';

let activeWs: WebSocket | null = null;

export function cleanupApiStudio(): void {
  if (activeWs) {
    try {
      activeWs.close();
    } catch {
      /* ignore */
    }
    activeWs = null;
  }
}

export function renderApiStudio(container: HTMLElement, data: SiteData, entryId?: string): void {
  cleanupApiStudio();

  const allEntries: StudioEntry[] = [
    ...data.actions,
    ...data.pushEvents,
    ...data.directEndpoints,
  ];
  const entryById = new Map<string, StudioEntry>(allEntries.map((e) => [e.id, e]));

  let selected: StudioEntry =
    (entryId && entryById.get(entryId)) ||
    entryById.get('send_group_msg') ||
    allEntries[0];

  let filterText = '';
  let kindFilter: KindFilter = 'all';
  let centerTab: CenterTab = 'doc';
  let protoView: ProtoView = 'http';
  let codeLang: CodeLang = 'curl';
  let codePaneOpen = false;
  let envOpen = false;
  const env = loadEnv();
  let history = loadHistory();
  const expandedGroups = new Set<string>([selected.category]);

  let bodyText = defaultBodyFor(selected);
  let lastResp: {
    statusText: string;
    ok: boolean;
    ms: number;
    content: string;
    isJson: boolean;
    corsHint?: boolean;
  } | null = null;

  let wsConnected = false;
  let wsStatusText = '未连接';
  let wsFilterMatching = true;
  let wsFrames: Array<{ at: string; matched: boolean; summary: string; data: unknown }> = [];

  function defaultBodyFor(entry: StudioEntry): string {
    if (entry.kind === 'action') return JSON.stringify(entry.exampleBody ?? {}, null, 2);
    if (entry.kind === 'http' && entry.exampleBody) return JSON.stringify(entry.exampleBody, null, 2);
    return '{}';
  }

  function selectEntry(next: StudioEntry, keepTab = false): void {
    selected = next;
    expandedGroups.add(next.category);
    bodyText = defaultBodyFor(next);
    lastResp = null;
    if (!keepTab) centerTab = 'doc';
    if (next.kind === 'event' && codeLang === 'curl') codeLang = 'javascript';
    if (next.kind === 'http' && codeLang === 'websocket') codeLang = 'curl';
    const targetHash = `#/api/${encodeURIComponent(next.id)}`;
    if (location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
    paint();
  }

  function matchesEvent(ev: PushEvent, payload: Record<string, unknown>): boolean {
    for (const [k, expected] of Object.entries(ev.discriminator)) {
      const actual = String(payload[k] ?? '');
      const allowed = expected.split('|').map((s) => s.trim());
      if (!allowed.includes(actual)) return false;
    }
    return true;
  }

  function getFilteredGrouped(): Array<[string, StudioEntry[]]> {
    const q = filterText.trim().toLowerCase();
    const map = new Map<string, StudioEntry[]>();
    for (const e of allEntries) {
      if (kindFilter !== 'all' && e.kind !== kindFilter) continue;
      if (q) {
        const hay = [
          e.name,
          e.path,
          e.summary,
          e.category,
          e.kind === 'action' ? e.aliases.join(' ') : '',
          e.kind === 'event' ? e.title : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return [...map.entries()];
  }

  function renderCodePaneHtml(): string {
    const snippet = generateCodeSnippet(selected, codeLang, {
      baseUrl: env.baseUrl,
      wsUrl: env.wsUrl,
      token: env.token,
      bodyText,
    });
    const langs: Array<{ id: CodeLang; label: string }> =
      selected.kind === 'event'
        ? [
            { id: 'javascript', label: 'Node WS' },
            { id: 'python', label: 'Python WS' },
            { id: 'websocket', label: 'Payload' },
            { id: 'curl', label: '订阅说明' },
            { id: 'powershell', label: 'HTTP 上报' },
          ]
        : [
            { id: 'curl', label: 'cURL' },
            { id: 'powershell', label: 'PowerShell' },
            { id: 'javascript', label: 'JS fetch' },
            { id: 'python', label: 'Python' },
            { id: 'websocket', label: 'WS JSON' },
          ];

    return `
      <div class="code-pane-head">
        <div class="code-pane-title">
          <span>${selected.kind === 'event' ? '事件订阅示例' : '请求代码示例'}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="doc-copy-btn" id="studio-copy-code">${icon('copy', 12)}<span>复制</span></button>
            <button type="button" class="doc-copy-btn" id="studio-close-code" title="收起代码示例" aria-label="收起代码示例">${icon('x', 12)}</button>
          </div>
        </div>
        <div class="code-lang-tabs">
          ${langs
            .map(
              (l) => `<button type="button" class="code-lang-tab ${l.id === codeLang ? 'active' : ''}" data-lang="${l.id}">${l.label}</button>`,
            )
            .join('')}
        </div>
      </div>
      <pre class="code-pane-pre" id="studio-code-output">${codeLang === 'websocket' ? highlightJson(snippet) : esc(snippet)}</pre>
      ${
        history.length
          ? `<div class="code-pane-sub">
              <h4>最近调试记录</h4>
              ${history
                .map(
                  (h, idx) => `
                  <button type="button" class="history-chip" data-hist-idx="${idx}" title="${esc(h.at)} · 点击回填">
                    <span><span class="hist-dot ${h.ok ? 'ok' : 'err'}"></span>${esc(h.label)}</span>
                    <span style="opacity:.65">${h.ms}ms</span>
                  </button>`,
                )
                .join('')}
            </div>`
          : ''
      }
    `;
  }

  function renderDocTab(entry: StudioEntry): string {
    if (entry.kind === 'event') {
      return `
        <div class="studio-section">
          <div class="studio-section-head">
            <h3>事件载荷字段</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${entry.channels.map((ch) => `<span class="pill pill-honey">${icon('radio', 11)}<span>${esc(ch)}</span></span>`).join('')}
            </div>
          </div>
          <div class="studio-disc-bar">
            ${Object.entries(entry.discriminator)
              .map(([k, v]) => `<span><code>${esc(k)}</code> = <code>${esc(v)}</code></span>`)
              .join('')}
          </div>
          <div class="doc-table-wrap">
            <table class="doc-table">
              <thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
              <tbody>
                ${entry.fields
                  .map(
                    (f) => `
                    <tr>
                      <td><code>${esc(f.name)}</code></td>
                      <td><code style="color:var(--info)">${esc(f.type)}</code></td>
                      <td>${f.required ? '<span class="pill pill-bad">必填</span>' : '<span class="pill">可选</span>'}</td>
                      <td>${esc(f.description)}</td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <details class="studio-fold">
          <summary>
            <span>标准推送 JSON 示例</span>
            <button type="button" class="btn btn-ghost btn-xs" id="studio-copy-mock">${icon('copy', 12)}<span>复制</span></button>
          </summary>
          <div class="studio-fold-body">
            <pre class="response-pre">${highlightJson(entry.payload)}</pre>
          </div>
        </details>
      `;
    }

    const params = entry.params;
    return `
      <div class="studio-section">
        <div class="studio-section-head">
          <h3>${entry.kind === 'http' ? '请求参数' : '请求参数'}</h3>
          <span class="studio-section-meta">${params.length ? `共 ${params.length} 项` : '无参数'}</span>
        </div>
        ${
          entry.kind === 'http'
            ? `<p class="studio-inline-note"><strong>鉴权：</strong>${esc(entry.auth)}</p>`
            : ''
        }
        ${
          params.length
            ? `<div class="doc-table-wrap"><table class="doc-table">
                <thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>默认值</th><th>说明</th></tr></thead>
                <tbody>
                  ${params
                    .map(
                      (p) => `
                      <tr>
                        <td><code>${esc(p.name)}</code></td>
                        <td><code style="color:var(--info)">${esc(p.type)}</code></td>
                        <td>${p.required ? '<span class="pill pill-bad">必填</span>' : '<span class="pill">可选</span>'}</td>
                        <td>${p.defaultValue !== undefined ? `<code>${esc(JSON.stringify(p.defaultValue))}</code>` : '<span style="color:var(--faint)">-</span>'}</td>
                        <td>
                          ${esc(p.description || '-')}
                          ${p.aliases.length ? `<span class="studio-alias-inline">（别名 ${p.aliases.map((a) => `<code>${esc(a)}</code>`).join(' / ')}）</span>` : ''}
                        </td>
                      </tr>`,
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : `<p class="studio-empty-note">无需参数，直接传 <code>{}</code> 即可。</p>`
        }
      </div>

      <div class="studio-section">
        <div class="studio-section-head">
          <h3>返回结果</h3>
          <span class="studio-section-meta">${entry.kind === 'http' ? 'HTTP Response' : 'data 载荷'}</span>
        </div>
        <p class="studio-return-desc">${esc(entry.returns)}</p>
        ${entry.notes ? `<p class="studio-inline-note">${esc(entry.notes)}</p>` : ''}

        <details class="studio-fold">
          <summary>
            <span>200 OK · 响应示例 JSON</span>
            <button type="button" class="btn btn-ghost btn-xs" id="studio-copy-mock">${icon('copy', 12)}<span>复制</span></button>
          </summary>
          <div class="studio-fold-body">
            <pre class="response-pre">${typeof entry.mockResponse === 'string' ? esc(entry.mockResponse) : highlightJson(entry.mockResponse)}</pre>
          </div>
        </details>
      </div>

      ${
        entry.kind === 'action'
          ? `<div class="studio-foot-hint">
              <span>需要查看 <code>retcode</code> 错误码或消息段字段？</span>
              <a href="#/schema">前往事件与消息段参考 ${icon('arrow-right', 13)}</a>
            </div>`
          : ''
      }
    `;
  }

  function renderDebugTab(entry: StudioEntry): string {
    if (entry.kind === 'event') {
      const visibleFrames = wsFilterMatching ? wsFrames.filter((f) => f.matched) : wsFrames;
      return `
        <div class="studio-card">
          <h3>实时 WebSocket 事件监听器</h3>
          <p style="margin:0 0 12px;color:var(--muted);font-size:13px;">
            主动上报事件不会做成 Action。填好你的正向 WebSocket 地址和 Token，即可实时连接 <code>?role=event</code> 捕获并过滤 <code>${esc(entry.name)}</code> 事件帧，或点击「模拟推送」直接预览。
          </p>
          <div class="env-bar">
            <div class="field-group">
              <label>正向 WS 地址</label>
              <input class="field-input" id="env-ws-url" value="${esc(env.wsUrl)}" placeholder="ws://127.0.0.1:3001/ws" />
            </div>
            <div class="field-group">
              <label>OneBot Token（通过 URL access_token 传入）</label>
              <input class="field-input" id="env-token" type="password" value="${esc(env.token)}" placeholder="未设置鉴权可留空" />
            </div>
          </div>
          <div class="debug-actions">
            <button type="button" class="btn btn-primary btn-sm" id="ws-toggle-btn">${icon(wsConnected ? 'stop' : 'plug', 14)}<span>${wsConnected ? '断开监听' : '连接并实时监听'}</span></button>
            <button type="button" class="btn btn-secondary btn-sm" id="ws-sim-btn">${icon('play', 13)}<span>模拟推送一帧</span></button>
            <button type="button" class="btn btn-ghost btn-sm" id="ws-clear-btn">清空记录</button>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2);cursor:pointer;margin-left:auto;">
              <input type="checkbox" id="ws-filter-match" ${wsFilterMatching ? 'checked' : ''} />
              仅显示匹配 ${esc(entry.name)} 的事件
            </label>
          </div>
          <div style="margin-top:10px;font-size:12.5px;color:var(--muted);">
            连接状态：<strong style="color:${wsConnected ? 'var(--ok)' : 'var(--muted)'}">${esc(wsStatusText)}</strong> · 已捕获 ${visibleFrames.length} 条
          </div>
        </div>

        <div class="studio-card">
          <h3>捕获到的事件流</h3>
          ${
            visibleFrames.length
              ? visibleFrames
                  .map(
                    (f) => `
                  <div class="response-box" style="margin-top:10px;">
                    <div class="response-head">
                      <span style="color:${f.matched ? '#f4cb54' : '#94a69b'};font-weight:600;">${esc(f.summary)}</span>
                      <span style="opacity:.7">${esc(f.at)}</span>
                    </div>
                    <pre class="response-pre" style="max-height:220px;">${highlightJson(f.data)}</pre>
                  </div>`,
                  )
                  .join('')
              : `<p style="margin:0;color:var(--muted);font-size:13px;">尚无事件帧。点击「连接并实时监听」或「模拟推送一帧」查看载荷结构。</p>`
          }
        </div>
      `;
    }

    let parsedObj: Record<string, unknown> = {};
    try {
      const p = JSON.parse(bodyText);
      if (p && typeof p === 'object' && !Array.isArray(p)) parsedObj = p as Record<string, unknown>;
    } catch {
      /* ignore */
    }

    return `
      <div class="studio-section">
        <div class="studio-env-strip">
          <span class="mono" style="font-size:12px;color:var(--ink-2);">${esc(env.baseUrl)}</span>
          <span style="font-size:11.5px;color:var(--muted);">${env.token ? '已配置 Token' : '无 Token'}</span>
          <button type="button" class="btn btn-ghost btn-xs" id="studio-toggle-env" style="margin-left:auto;">${icon('sliders', 12)}<span>${envOpen ? '收起连接设置' : '连接设置'}</span></button>
        </div>

        ${
          envOpen
            ? `<div class="env-bar" style="margin-top:10px;">
                <div class="field-group">
                  <label>Panette HTTP Base URL</label>
                  <input class="field-input" id="env-base-url" value="${esc(env.baseUrl)}" placeholder="http://127.0.0.1:3001" />
                </div>
                <div class="field-group">
                  <label>Bearer Token（可选，仅存本机浏览器）</label>
                  <input class="field-input" id="env-token" type="password" value="${esc(env.token)}" placeholder="未设置鉴权可留空" />
                </div>
              </div>`
            : ''
        }

        ${
          entry.kind === 'action' && entry.params.length
            ? `<div style="margin:14px 0 10px;">
                <div class="param-form-grid">
                  ${entry.params
                    .slice(0, 10)
                    .map((p) => {
                      const val = parsedObj[p.name];
                      const valStr =
                        val === undefined
                          ? ''
                          : typeof val === 'string'
                            ? val
                            : JSON.stringify(val);
                      return `
                        <div class="field-group">
                          <label>${esc(p.name)} ${p.required ? '<span style="color:var(--bad)">*</span>' : ''} <span style="opacity:.65">(${esc(p.type)})</span></label>
                          <input class="field-input" data-param-field="${esc(p.name)}" data-param-type="${esc(p.type)}" value="${esc(valStr)}" placeholder="${esc(p.defaultValue !== undefined ? `默认: ${JSON.stringify(p.defaultValue)}` : p.description.slice(0, 28))}" />
                        </div>`;
                    })
                    .join('')}
                </div>
              </div>`
            : ''
        }

        ${
          entry.kind === 'action'
            ? `<div class="field-group" style="margin-top:10px;">
                <label style="display:flex;justify-content:space-between;align-items:center;">
                  <span>JSON Body</span>
                  <button type="button" class="btn btn-ghost btn-xs" id="studio-reset-body">${icon('rotate', 12)}<span>重置</span></button>
                </label>
                <textarea class="json-editor" id="studio-body-editor" spellcheck="false">${esc(bodyText)}</textarea>
              </div>`
            : `<p class="studio-empty-note" style="margin-top:12px;">直连请求 <strong>${entry.method}</strong> <code>${esc(entry.path)}</code></p>`
        }

        <div class="debug-actions">
          <button type="button" class="btn btn-primary btn-sm" id="studio-send-real">${icon('play', 13)}<span>发送请求</span></button>
          <button type="button" class="btn btn-secondary btn-sm" id="studio-send-mock">${icon('zap', 13)}<span>Mock 预览</span></button>
          <button type="button" class="btn btn-ghost btn-sm" id="studio-open-code-inline" style="margin-left:auto;">${icon('file-code', 13)}<span>${codePaneOpen ? '收起代码示例' : '查看代码示例'}</span></button>
        </div>

        ${
          lastResp
            ? `<div class="response-box">
                <div class="response-head">
                  <span class="pill ${lastResp.ok ? 'pill-ok' : 'pill-bad'}">${esc(lastResp.statusText)}</span>
                  <span style="color:#a4b5aa;">${lastResp.ms} ms</span>
                </div>
                ${
                  lastResp.corsHint
                    ? `<div style="padding:10px 14px;background:rgba(235,185,56,0.12);border-bottom:1px solid rgba(235,185,56,0.28);color:#f4cb54;font-size:12px;">
                        无法直连目标（本机服务未启动或跨域受限），可用「Mock 预览」或点右上角「代码示例」在终端执行。
                      </div>`
                    : ''
                }
                <pre class="response-pre">${lastResp.isJson ? highlightJson(lastResp.content) : esc(lastResp.content)}</pre>
              </div>`
            : ''
        }
      </div>
    `;
  }

  function updateCodePaneOnly(): void {
    const pane = container.querySelector<HTMLElement>('.studio-code-pane');
    if (pane) {
      pane.innerHTML = renderCodePaneHtml();
      wireCodePaneEvents(pane);
    }
  }

  function wireCodePaneEvents(pane: HTMLElement): void {
    pane.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        codeLang = (btn.dataset.lang as CodeLang) || 'curl';
        updateCodePaneOnly();
      });
    });

    pane.querySelector('#studio-copy-code')?.addEventListener('click', () => {
      const code = generateCodeSnippet(selected, codeLang, {
        baseUrl: env.baseUrl,
        wsUrl: env.wsUrl,
        token: env.token,
        bodyText,
      });
      void copyToClipboard(code, '示例代码已复制');
    });

    pane.querySelector('#studio-close-code')?.addEventListener('click', () => {
      codePaneOpen = false;
      paint();
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-hist-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = history[Number(btn.dataset.histIdx)];
        if (!item) return;
        const found = entryById.get(item.id);
        if (found) {
          selected = found;
          bodyText = item.body;
          centerTab = 'debug';
          paint();
        }
      });
    });
  }

  function paint(): void {
    const prevTreeScroll = container.querySelector<HTMLElement>('#studio-tree-list')?.scrollTop ?? 0;
    const grouped = getFilteredGrouped();
    const totalVisible = grouped.reduce((s, [, arr]) => s + arr.length, 0);

    const displayPath =
      selected.kind === 'action'
        ? protoView === 'http'
          ? `${env.baseUrl.replace(/\/+$/, '')}${selected.path}`
          : `${env.wsUrl}  ->  {"action":"${selected.name}","params":{...}}`
        : selected.kind === 'http'
          ? `${env.baseUrl.replace(/\/+$/, '')}${selected.path}`
          : `${env.wsUrl}?role=event  <-  ${selected.path}`;

    const badgeMethod =
      selected.kind === 'action' && protoView === 'ws' ? 'WS' : selected.method;

    container.innerHTML = `
      <div class="studio-shell ${codePaneOpen ? 'code-open' : ''}">
        <aside class="studio-tree" aria-label="API 目录树">
          <div class="studio-tree-head">
            <input class="studio-filter-input" id="studio-filter" value="${esc(filterText)}" placeholder="过滤 ${allEntries.length} 个接口与事件" />
            <div class="studio-kind-pills">
              <button type="button" class="kind-pill ${kindFilter === 'all' ? 'active' : ''}" data-kind="all">全部 ${allEntries.length}</button>
              <button type="button" class="kind-pill ${kindFilter === 'action' ? 'active' : ''}" data-kind="action">动作 ${data.actions.length}</button>
              <button type="button" class="kind-pill ${kindFilter === 'event' ? 'active' : ''}" data-kind="event">事件 ${data.pushEvents.length}</button>
              <button type="button" class="kind-pill ${kindFilter === 'http' ? 'active' : ''}" data-kind="http">直连 ${data.directEndpoints.length}</button>
            </div>
          </div>

          <div class="studio-tree-list" id="studio-tree-list">
            ${
              totalVisible === 0
                ? '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12.5px;">没有匹配的接口或事件</div>'
                : grouped
                    .map(([cat, items]) => {
                      const isExpanded = Boolean(filterText.trim()) || expandedGroups.has(cat);
                      return `
                        <div class="tree-group ${isExpanded ? 'open' : ''}">
                          <button type="button" class="tree-group-btn" data-toggle-cat="${esc(cat)}" aria-expanded="${isExpanded}">
                            <span class="tree-group-left"><span class="tree-chevron">${icon('chevron-right', 13)}</span><span>${esc(cat)}</span></span>
                            <span class="tree-group-count">${items.length}</span>
                          </button>
                          <div class="tree-items-wrap">
                            <div class="tree-items">
                              ${items
                                .map(
                                  (item) => `
                                  <button type="button" class="tree-item ${item.id === selected.id ? 'active' : ''}" data-entry-id="${esc(item.id)}" title="${esc(item.summary)}">
                                    <span class="method-badge method-${item.method}">${item.method}</span>
                                    <span class="tree-item-name">${esc(item.kind === 'http' ? item.path : item.name)}</span>
                                  </button>`,
                                )
                                .join('')}
                            </div>
                          </div>
                        </div>`;
                    })
                    .join('')
            }
          </div>

          <div class="studio-tree-foot">
            <a class="btn btn-secondary btn-xs" style="flex:1;" href="${esc(SITE_CONFIG.links.openapiSpec)}" download="panette-openapi-3.1.json">${icon('download', 12)}<span>导出 OpenAPI 3.1</span></a>
          </div>
        </aside>

        <section class="studio-main">
          <div class="studio-main-inner">
            <div class="studio-endpoint-head">
              <div class="endpoint-title-row">
                <h1>
                  <span class="method-badge method-${badgeMethod}">${badgeMethod}</span>
                  <span>${esc(selected.kind === 'event' ? `${selected.title} (${selected.name})` : selected.name)}</span>
                </h1>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="btn btn-xs ${codePaneOpen ? 'btn-primary' : 'btn-secondary'}" id="studio-toggle-code">${icon('file-code', 12)}<span>${codePaneOpen ? '收起代码' : '代码示例'}</span></button>
                  <a class="btn btn-ghost btn-xs" href="#/docs/${esc(selected.docId)}/${encodeURIComponent(selected.docAnchor)}">${icon('book', 12)}<span>原文档</span></a>
                </div>
              </div>
              <p class="endpoint-summary">${esc(selected.summary)}</p>

              ${
                selected.kind === 'action' && selected.aliases.length
                  ? `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px;">
                      <span style="font-size:12px;color:var(--muted);">别名：</span>
                      ${selected.aliases.map((a) => `<span class="pill mono">${esc(a)}</span>`).join('')}
                    </div>`
                  : ''
              }

              <div class="url-bar">
                ${
                  selected.kind === 'action'
                    ? `<button type="button" class="btn btn-xs ${protoView === 'http' ? 'btn-primary' : 'btn-ghost'}" data-proto="http">HTTP</button>
                       <button type="button" class="btn btn-xs ${protoView === 'ws' ? 'btn-primary' : 'btn-ghost'}" data-proto="ws">WS</button>`
                    : `<span class="method-badge method-${selected.method}">${selected.method}</span>`
                }
                <span class="url-bar-path">${esc(displayPath)}</span>
                <button type="button" class="btn btn-ghost btn-xs" id="studio-copy-url">${icon('copy', 12)}<span>复制</span></button>
              </div>
            </div>

            <div class="studio-tabs">
              <div class="studio-tab-group">
                <button type="button" class="studio-tab ${centerTab === 'doc' ? 'active' : ''}" data-ctab="doc">${icon('file-code', 14)}<span>接口文档</span></button>
                <button type="button" class="studio-tab ${centerTab === 'debug' ? 'active' : ''}" data-ctab="debug">${icon(selected.kind === 'event' ? 'radio' : 'terminal', 14)}<span>${selected.kind === 'event' ? '实时监听 / 模拟' : '在线调试'}</span></button>
              </div>
              <span style="font-size:12px;color:var(--muted);padding-bottom:6px;">${esc(selected.category)}</span>
            </div>

            <div id="studio-center-body">
              ${centerTab === 'doc' ? renderDocTab(selected) : renderDebugTab(selected)}
            </div>
          </div>
        </section>

        ${
          codePaneOpen
            ? `<aside class="studio-code-pane" aria-label="示例代码与历史">
                ${renderCodePaneHtml()}
              </aside>`
            : ''
        }
      </div>
    `;

    const filterInput = container.querySelector<HTMLInputElement>('#studio-filter');
    filterInput?.addEventListener('input', () => {
      filterText = filterInput.value;
      const pos = filterInput.selectionStart ?? filterText.length;
      paint();
      const again = container.querySelector<HTMLInputElement>('#studio-filter');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        kindFilter = (btn.dataset.kind as KindFilter) || 'all';
        paint();
      });
    });

    const treeListEl = container.querySelector<HTMLElement>('#studio-tree-list');
    if (treeListEl && prevTreeScroll > 0) treeListEl.scrollTop = prevTreeScroll;

    container.querySelectorAll<HTMLButtonElement>('[data-toggle-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.toggleCat || '';
        const groupEl = btn.closest('.tree-group');
        const nextOpen = !groupEl?.classList.contains('open');
        if (nextOpen) expandedGroups.add(cat);
        else expandedGroups.delete(cat);
        groupEl?.classList.toggle('open', nextOpen);
        btn.setAttribute('aria-expanded', String(nextOpen));
      });
    });

    container.querySelector('#studio-toggle-code')?.addEventListener('click', () => {
      codePaneOpen = !codePaneOpen;
      paint();
    });

    container.querySelector('#studio-open-code-inline')?.addEventListener('click', () => {
      codePaneOpen = !codePaneOpen;
      paint();
    });

    container.querySelector('#studio-toggle-env')?.addEventListener('click', () => {
      envOpen = !envOpen;
      paint();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-entry-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = entryById.get(btn.dataset.entryId || '');
        if (found) selectEntry(found);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-proto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        protoView = (btn.dataset.proto as ProtoView) || 'http';
        if (protoView === 'ws') codeLang = 'websocket';
        else if (codeLang === 'websocket') codeLang = 'curl';
        paint();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-ctab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        centerTab = (btn.dataset.ctab as CenterTab) || 'doc';
        paint();
      });
    });

    container.querySelector('#studio-copy-url')?.addEventListener('click', () => {
      void copyToClipboard(displayPath, '地址已复制');
    });

    container.querySelector('#studio-copy-mock')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const payload = selected.kind === 'event' ? selected.payload : selected.mockResponse;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      void copyToClipboard(text, 'JSON 示例已复制');
    });

    const baseInput = container.querySelector<HTMLInputElement>('#env-base-url');
    baseInput?.addEventListener('input', () => {
      env.baseUrl = baseInput.value.trim() || SITE_CONFIG.defaults.onebotBaseUrl;
      saveEnv(env);
      updateCodePaneOnly();
    });

    const wsInput = container.querySelector<HTMLInputElement>('#env-ws-url');
    wsInput?.addEventListener('input', () => {
      env.wsUrl = wsInput.value.trim() || SITE_CONFIG.defaults.onebotWsUrl;
      saveEnv(env);
      updateCodePaneOnly();
    });

    const tokInput = container.querySelector<HTMLInputElement>('#env-token');
    tokInput?.addEventListener('input', () => {
      env.token = tokInput.value;
      saveEnv(env);
      updateCodePaneOnly();
    });

    const editor = container.querySelector<HTMLTextAreaElement>('#studio-body-editor');
    editor?.addEventListener('input', () => {
      bodyText = editor.value;
      updateCodePaneOnly();
    });

    container.querySelectorAll<HTMLInputElement>('[data-param-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        let obj: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(bodyText);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
        } catch {
          obj = {};
        }
        const key = inp.dataset.paramField || '';
        const ptype = inp.dataset.paramType || 'string';
        const raw = inp.value;
        if (!raw.trim()) {
          delete obj[key];
        } else if (/boolean/.test(ptype) && (raw === 'true' || raw === 'false')) {
          obj[key] = raw === 'true';
        } else if (/^number/.test(ptype) && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
          obj[key] = Number(raw.trim());
        } else if ((raw.trim().startsWith('{') || raw.trim().startsWith('[')) && (() => { try { JSON.parse(raw); return true; } catch { return false; } })()) {
          obj[key] = JSON.parse(raw);
        } else {
          obj[key] = raw;
        }
        bodyText = JSON.stringify(obj, null, 2);
        if (editor) editor.value = bodyText;
        updateCodePaneOnly();
      });
    });

    container.querySelector('#studio-reset-body')?.addEventListener('click', () => {
      bodyText = defaultBodyFor(selected);
      paint();
    });

    container.querySelector('#studio-send-mock')?.addEventListener('click', () => {
      const mock = selected.kind === 'event' ? selected.payload : selected.mockResponse;
      const isJson = typeof mock !== 'string';
      const content = isJson ? JSON.stringify(mock, null, 2) : String(mock);
      lastResp = { statusText: 'MOCK 200 · retcode=0', ok: true, ms: 12, content, isJson };
      recordHist(true, 12);
      paint();
    });

    container.querySelector('#studio-send-real')?.addEventListener('click', async () => {
      if (selected.kind === 'event') return;
      const url = `${env.baseUrl.replace(/\/+$/, '')}${selected.path}`;
      const headers: Record<string, string> = {};
      if (env.token.trim()) headers.Authorization = `Bearer ${env.token.trim()}`;

      let reqBody: string | undefined;
      if (selected.kind === 'action') {
        try {
          JSON.parse(bodyText || '{}');
        } catch (e) {
          showToast(`JSON 语法错误：${(e as Error).message}`, 'err');
          return;
        }
        headers['Content-Type'] = 'application/json';
        reqBody = bodyText || '{}';
      }

      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: selected.method,
          headers,
          body: reqBody,
        });
        const elapsed = Math.max(1, Math.round(performance.now() - t0));
        const text = await res.text();
        let isJson = false;
        let formatted = text;
        let ok = res.ok;
        try {
          const parsed = JSON.parse(text) as { retcode?: number; status?: string };
          formatted = JSON.stringify(parsed, null, 2);
          isJson = true;
          if (typeof parsed.retcode === 'number') ok = parsed.retcode === 0;
        } catch {
          /* plain text */
        }
        lastResp = {
          statusText: `HTTP ${res.status} ${res.statusText || (ok ? 'OK' : 'ERROR')}`,
          ok,
          ms: elapsed,
          content: formatted,
          isJson,
        };
        recordHist(ok, elapsed);
        paint();
      } catch (err) {
        const elapsed = Math.max(1, Math.round(performance.now() - t0));
        lastResp = {
          statusText: 'NETWORK / CORS BLOCKED',
          ok: false,
          ms: elapsed,
          content: String((err as Error).message || err),
          isJson: false,
          corsHint: true,
        };
        recordHist(false, elapsed);
        paint();
      }
    });

    container.querySelector('#ws-filter-match')?.addEventListener('change', (e) => {
      wsFilterMatching = (e.target as HTMLInputElement).checked;
      paint();
    });

    container.querySelector('#ws-clear-btn')?.addEventListener('click', () => {
      wsFrames = [];
      paint();
    });

    container.querySelector('#ws-sim-btn')?.addEventListener('click', () => {
      if (selected.kind !== 'event') return;
      const now = new Date().toLocaleTimeString();
      const simPayload = { ...selected.payload, time: Math.floor(Date.now() / 1000) };
      wsFrames.unshift({
        at: now,
        matched: true,
        summary: `MOCK · ${selected.name}`,
        data: simPayload,
      });
      wsFrames = wsFrames.slice(0, 30);
      showToast(`已模拟推送 ${selected.name}`, 'info');
      paint();
    });

    container.querySelector('#ws-toggle-btn')?.addEventListener('click', () => {
      if (wsConnected && activeWs) {
        cleanupApiStudio();
        wsConnected = false;
        wsStatusText = '已手动断开';
        paint();
        return;
      }
      if (selected.kind !== 'event') return;
      const currentEv = selected;
      try {
        const u = new URL(env.wsUrl);
        u.searchParams.set('role', 'event');
        if (env.token.trim()) u.searchParams.set('access_token', env.token.trim());
        wsStatusText = '正在连接…';
        paint();
        const ws = new WebSocket(u.toString());
        activeWs = ws;
        ws.onopen = () => {
          wsConnected = true;
          wsStatusText = `已连接 ${u.host}${u.pathname}`;
          showToast('已连接到正向 WS 事件流', 'ok');
          paint();
        };
        ws.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(String(evt.data)) as Record<string, unknown>;
            const matched = matchesEvent(currentEv, parsed);
            const tag = [parsed.post_type, parsed.message_type || parsed.notice_type || parsed.meta_event_type, parsed.sub_type]
              .filter(Boolean)
              .join('.');
            wsFrames.unshift({
              at: new Date().toLocaleTimeString(),
              matched,
              summary: tag || 'event',
              data: parsed,
            });
            wsFrames = wsFrames.slice(0, 40);
            paint();
          } catch {
            /* ignore non-json */
          }
        };
        ws.onerror = () => {
          wsStatusText = '连接失败（请检查本机 Panette WS 端口与 Token）';
          wsConnected = false;
          paint();
        };
        ws.onclose = () => {
          wsConnected = false;
          if (activeWs === ws) activeWs = null;
          wsStatusText = '连接已关闭';
          paint();
        };
      } catch (err) {
        showToast(`无效 WS 地址：${(err as Error).message}`, 'err');
      }
    });

    const codePane = container.querySelector<HTMLElement>('.studio-code-pane');
    if (codePane) wireCodePaneEvents(codePane);
  }

  function recordHist(ok: boolean, ms: number): void {
    history.unshift({
      id: selected.id,
      label: selected.kind === 'http' ? selected.path : selected.name,
      body: bodyText,
      ok,
      ms,
      at: new Date().toLocaleTimeString(),
    });
    history = history.slice(0, 12);
    saveHistory(history);
  }

  paint();
}

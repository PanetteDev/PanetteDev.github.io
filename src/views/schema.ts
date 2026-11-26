import type { PushEvent, SiteData } from '../types.ts';
import { copyToClipboard, esc, highlightJson } from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

type SchemaTab = 'events' | 'segments-recv' | 'segments-send' | 'retcodes';
type SegmentItem = SiteData['segments']['receive'][number];

export function renderSchema(container: HTMLElement, data: SiteData): void {
  let tab: SchemaTab = 'events';
  let selectedEventId = data.pushEvents[0]?.id ?? '';
  let selectedRecvType = data.segments.receive[0]?.type ?? '';
  let selectedSendType = data.segments.send[0]?.type ?? '';

  function renderEventDetail(ev: PushEvent): string {
    return `
      <div class="schema-detail-head">
        <div>
          <div class="schema-detail-title">
            <span class="method-badge method-EVENT">EVENT</span>
            <h3>${esc(ev.title)}</h3>
          </div>
          <p class="schema-detail-desc">${esc(ev.summary)}</p>
        </div>
        <a class="btn btn-secondary btn-xs" href="#/api/${esc(ev.id)}">${icon('radio', 12)}<span>在 Studio 实时监听</span></a>
      </div>

      <div class="schema-meta-row">
        ${Object.entries(ev.discriminator)
          .map(([k, v]) => `<span class="schema-kv"><code>${esc(k)}</code><span>=</span><code>${esc(v)}</code></span>`)
          .join('')}
        <span class="schema-meta-sep"></span>
        ${ev.channels.map((ch) => `<span class="pill pill-honey">${esc(ch)}</span>`).join('')}
      </div>

      <div class="schema-block">
        <div class="schema-block-title">关键字段</div>
        <div class="doc-table-wrap" style="margin:0;">
          <table class="doc-table">
            <thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
            <tbody>
              ${ev.fields
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

      <div class="schema-block">
        <div class="schema-block-head">
          <span class="schema-block-title">标准推送 JSON</span>
          <button type="button" class="btn btn-ghost btn-xs" data-copy-json="${esc(JSON.stringify(ev.payload, null, 2))}">${icon('copy', 12)}<span>复制 JSON</span></button>
        </div>
        <div class="schema-code-box">
          <pre>${highlightJson(ev.payload)}</pre>
        </div>
      </div>
    `;
  }

  function renderSegmentDetail(seg: SegmentItem, direction: 'recv' | 'send'): string {
    return `
      <div class="schema-detail-head">
        <div>
          <div class="schema-detail-title">
            <span class="pill ${direction === 'recv' ? 'pill-info' : 'pill-ok'} mono">${esc(seg.type)}</span>
            <h3>${esc(seg.desc)}</h3>
          </div>
          <p class="schema-detail-desc">${direction === 'recv' ? '入站消息事件中的消息段结构' : '调用 send_*_msg 时传入的消息段结构'}</p>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" data-copy-json="${esc(JSON.stringify(seg.example, null, 2))}">${icon('copy', 12)}<span>复制示例</span></button>
      </div>

      <div class="schema-kv-grid">
        <div class="schema-kv-card">
          <span class="schema-kv-label">data 字段</span>
          <code>${esc(seg.fields)}</code>
        </div>
        <div class="schema-kv-card">
          <span class="schema-kv-label">CQ 字符串格式</span>
          <code>${esc(seg.cq)}</code>
        </div>
      </div>

      <div class="schema-block">
        <div class="schema-block-head">
          <span class="schema-block-title">Array 消息段示例</span>
          <button type="button" class="btn btn-ghost btn-xs" data-copy-json="${esc(JSON.stringify(seg.example, null, 2))}">${icon('copy', 12)}<span>复制 JSON</span></button>
        </div>
        <div class="schema-code-box">
          <pre>${highlightJson(seg.example)}</pre>
        </div>
      </div>
    `;
  }

  function renderBody(): string {
    if (tab === 'events') {
      const current = data.pushEvents.find((e) => e.id === selectedEventId) ?? data.pushEvents[0];
      return `
        <div class="schema-split">
          <aside class="schema-list" aria-label="事件列表">
            ${data.pushEvents
              .map((ev) => {
                const sub = Object.values(ev.discriminator).slice(0, 2).join(' · ');
                return `
                  <button type="button" class="schema-list-item ${ev.id === current.id ? 'active' : ''}" data-pick-event="${esc(ev.id)}">
                    <span class="schema-list-title">${esc(ev.title)}</span>
                    <span class="schema-list-sub mono">${esc(sub)}</span>
                  </button>`;
              })
              .join('')}
          </aside>
          <section class="schema-detail" id="schema-detail-pane">
            ${renderEventDetail(current)}
          </section>
        </div>
      `;
    }

    if (tab === 'segments-recv' || tab === 'segments-send') {
      const list = tab === 'segments-recv' ? data.segments.receive : data.segments.send;
      const curType = tab === 'segments-recv' ? selectedRecvType : selectedSendType;
      const current = list.find((s) => s.type === curType) ?? list[0];
      const dir = tab === 'segments-recv' ? 'recv' : 'send';
      return `
        <div class="schema-split">
          <aside class="schema-list" aria-label="消息段列表">
            ${list
              .map(
                (seg) => `
                  <button type="button" class="schema-list-item ${seg.type === current.type ? 'active' : ''}" data-pick-seg="${esc(seg.type)}">
                    <span class="schema-list-row">
                      <code class="schema-seg-tag">${esc(seg.type)}</code>
                      <span class="schema-list-title">${esc(seg.desc)}</span>
                    </span>
                  </button>`,
              )
              .join('')}
          </aside>
          <section class="schema-detail" id="schema-detail-pane">
            ${renderSegmentDetail(current, dir)}
          </section>
        </div>
      `;
    }

    return `
      <div class="schema-detail" style="animation:fadeSlideUp 0.2s var(--ease-out) both;">
        <div class="schema-detail-head" style="margin-bottom:14px;">
          <div>
            <div class="schema-detail-title"><h3>OneBot v11 retcode 状态码</h3></div>
            <p class="schema-detail-desc">多数业务错误仍返回 HTTP 200，调用方应以响应体中的 <code>retcode</code> 为准。</p>
          </div>
        </div>
        <div class="doc-table-wrap" style="margin:0;">
          <table class="doc-table">
            <thead><tr><th>retcode</th><th>status</th><th>含义与处理建议</th></tr></thead>
            <tbody>
              ${data.retcodes
                .map(
                  (r) => `
                  <tr>
                    <td><code style="font-size:13px;font-weight:600;">${r.code}</code></td>
                    <td><span class="pill ${r.code === 0 ? 'pill-ok' : 'pill-bad'}">${esc(r.status)}</span></td>
                    <td>${esc(r.meaning)}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wireDetailEvents(): void {
    container.querySelectorAll<HTMLButtonElement>('[data-copy-json]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void copyToClipboard(btn.dataset.copyJson || '', 'JSON 已复制');
      });
    });
  }

  function paint(): void {
    container.innerHTML = `
      <div class="page-wrap schema-page">
        <div class="schema-top">
          <div>
            <h2>事件与消息段参考</h2>
            <p>主动上报事件、Array / CQ 消息段与 retcode 状态码速查。</p>
          </div>
          <a class="btn btn-primary btn-sm" href="#/api/event_message_group">${icon('radio', 14)}<span>前往 Studio 监听</span></a>
        </div>

        <div class="studio-tabs schema-tabs">
          <div class="studio-tab-group">
            <button type="button" class="studio-tab ${tab === 'events' ? 'active' : ''}" data-stab="events">${icon('radio', 14)}<span>主动上报事件</span><span class="schema-tab-count">${data.pushEvents.length}</span></button>
            <button type="button" class="studio-tab ${tab === 'segments-recv' ? 'active' : ''}" data-stab="segments-recv">${icon('inbox', 14)}<span>接收消息段</span><span class="schema-tab-count">${data.segments.receive.length}</span></button>
            <button type="button" class="studio-tab ${tab === 'segments-send' ? 'active' : ''}" data-stab="segments-send">${icon('send', 14)}<span>发送消息段</span><span class="schema-tab-count">${data.segments.send.length}</span></button>
            <button type="button" class="studio-tab ${tab === 'retcodes' ? 'active' : ''}" data-stab="retcodes">${icon('activity', 14)}<span>状态码</span><span class="schema-tab-count">${data.retcodes.length}</span></button>
          </div>
        </div>

        <div id="schema-stage">${renderBody()}</div>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = (btn.dataset.stab as SchemaTab) || 'events';
        if (next === tab) return;
        tab = next;
        paint();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-pick-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pickEvent || '';
        const found = data.pushEvents.find((e) => e.id === id);
        if (!found) return;
        selectedEventId = id;
        container.querySelectorAll('[data-pick-event]').forEach((b) => b.classList.toggle('active', b === btn));
        const pane = container.querySelector<HTMLElement>('#schema-detail-pane');
        if (pane) {
          pane.innerHTML = renderEventDetail(found);
          pane.style.animation = 'none';
          void pane.offsetWidth;
          pane.style.animation = 'fadeSlideUp 0.18s var(--ease-out) both';
          wireDetailEvents();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-pick-seg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const segType = btn.dataset.pickSeg || '';
        const isRecv = tab === 'segments-recv';
        const list = isRecv ? data.segments.receive : data.segments.send;
        const found = list.find((s) => s.type === segType);
        if (!found) return;
        if (isRecv) selectedRecvType = segType;
        else selectedSendType = segType;
        container.querySelectorAll('[data-pick-seg]').forEach((b) => b.classList.toggle('active', b === btn));
        const pane = container.querySelector<HTMLElement>('#schema-detail-pane');
        if (pane) {
          pane.innerHTML = renderSegmentDetail(found, isRecv ? 'recv' : 'send');
          pane.style.animation = 'none';
          void pane.offsetWidth;
          pane.style.animation = 'fadeSlideUp 0.18s var(--ease-out) both';
          wireDetailEvents();
        }
      });
    });

    wireDetailEvents();
  }

  paint();
}

import type { SiteData } from '../types.ts';
import { esc } from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

interface SearchEntry {
  kind: 'doc' | 'action' | 'event' | 'http';
  badge: string;
  title: string;
  subtitle: string;
  href: string;
  haystack: string;
}

export function createSearchModal(data: SiteData) {
  const index: SearchEntry[] = [
    ...data.docs.map((d) => ({
      kind: 'doc' as const,
      badge: 'DOC',
      title: d.title,
      subtitle: `${d.group} · ${d.excerpt.slice(0, 72)}`,
      href: `#/docs/${d.id}`,
      haystack: `${d.title} ${d.group} ${d.searchText}`.toLowerCase(),
    })),
    ...data.actions.map((a) => ({
      kind: 'action' as const,
      badge: 'POST',
      title: a.name,
      subtitle: `${a.category} · ${a.summary}`,
      href: `#/api/${a.id}`,
      haystack: `${a.name} ${a.aliases.join(' ')} ${a.category} ${a.summary} ${a.paramsRaw}`.toLowerCase(),
    })),
    ...data.pushEvents.map((e) => ({
      kind: 'event' as const,
      badge: 'EVENT',
      title: `${e.title} (${e.name})`,
      subtitle: `主动上报事件 · ${e.summary}`,
      href: `#/api/${e.id}`,
      haystack: `${e.name} ${e.title} ${e.summary} ${Object.values(e.discriminator).join(' ')}`.toLowerCase(),
    })),
    ...data.directEndpoints.map((h) => ({
      kind: 'http' as const,
      badge: h.method,
      title: h.name,
      subtitle: `直连端点 · ${h.summary}`,
      href: `#/api/${h.id}`,
      haystack: `${h.name} ${h.path} ${h.summary}`.toLowerCase(),
    })),
  ];

  let backdrop: HTMLElement | null = null;
  let activeIndex = 0;
  let currentHits: SearchEntry[] = [];

  function close(): void {
    backdrop?.remove();
    backdrop = null;
  }

  function open(): void {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'search-backdrop';
    backdrop.innerHTML = `
      <div class="search-dialog" role="dialog" aria-modal="true" aria-label="全局搜索">
        <div class="search-input-wrap">
          ${icon('search', 16)}
          <input class="search-input" id="global-search-input" placeholder="搜索文档、OneBot 动作、推送事件或直连端点（如 send_group_msg / rkey / voice_call）" autocomplete="off" />
          <button type="button" class="btn btn-ghost btn-xs" id="global-search-close">ESC</button>
        </div>
        <div class="search-results" id="global-search-results"></div>
        <div class="search-footer">
          <span>上下键切换 · Enter 跳转 · ESC 关闭</span>
          <span>共索引 ${index.length} 条记录</span>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector<HTMLInputElement>('#global-search-input')!;
    const resultsEl = backdrop.querySelector<HTMLElement>('#global-search-results')!;

    const renderHits = (q: string) => {
      const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      currentHits = terms.length
        ? index.filter((item) => terms.every((t) => item.haystack.includes(t))).slice(0, 24)
        : [
            index.find((i) => i.href === '#/docs/installation')!,
            index.find((i) => i.href === '#/docs/pure-protocol')!,
            index.find((i) => i.href === '#/api/send_group_msg')!,
            index.find((i) => i.href === '#/api/event_message_group')!,
            index.find((i) => i.href === '#/api/voice_call_start')!,
            index.find((i) => i.href === '#/api/http_healthz')!,
          ].filter(Boolean);
      activeIndex = 0;
      paintHits();
    };

    const paintHits = () => {
      if (!currentHits.length) {
        resultsEl.innerHTML = '<div style="padding:26px;text-align:center;color:var(--muted);">没有匹配的结果，请尝试其他关键词</div>';
        return;
      }
      resultsEl.innerHTML = currentHits
        .map(
          (hit, idx) => `
          <button type="button" class="search-hit ${idx === activeIndex ? 'active' : ''}" data-hit-idx="${idx}">
            <span class="method-badge method-${hit.kind === 'doc' ? 'WS' : hit.badge}">${esc(hit.badge)}</span>
            <span class="search-hit-main">
              <div class="search-hit-title">${esc(hit.title)}</div>
              <div class="search-hit-sub">${esc(hit.subtitle)}</div>
            </span>
          </button>`,
        )
        .join('');

      resultsEl.querySelectorAll<HTMLButtonElement>('[data-hit-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const hit = currentHits[Number(btn.dataset.hitIdx)];
          if (hit) {
            close();
            location.hash = hit.href;
          }
        });
      });
    };

    input.addEventListener('input', () => renderHits(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(currentHits.length - 1, activeIndex + 1);
        paintHits();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
        paintHits();
      } else if (e.key === 'Enter' && currentHits[activeIndex]) {
        e.preventDefault();
        const hit = currentHits[activeIndex];
        close();
        location.hash = hit.href;
      } else if (e.key === 'Escape') {
        close();
      }
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('#global-search-close')?.addEventListener('click', close);

    renderHits('');
    requestAnimationFrame(() => input.focus());
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (backdrop) close();
      else open();
    } else if (e.key === 'Escape' && backdrop) {
      close();
    }
  });

  return { open, close };
}

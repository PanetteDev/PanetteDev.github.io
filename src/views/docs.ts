import type { DocPage, SiteData } from '../types.ts';
import { copyToClipboard, esc } from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

export function renderDocs(container: HTMLElement, data: SiteData, docId: string, anchor?: string): void {
  const idx = Math.max(
    0,
    data.docs.findIndex((d) => d.id === docId),
  );
  const current: DocPage = data.docs[idx] ?? data.docs[0];
  const prev = idx > 0 ? data.docs[idx - 1] : null;
  const next = idx < data.docs.length - 1 ? data.docs[idx + 1] : null;

  const groups = new Map<string, DocPage[]>();
  for (const d of data.docs) {
    const arr = groups.get(d.group) ?? [];
    arr.push(d);
    groups.set(d.group, arr);
  }

  container.innerHTML = `
    <div class="docs-shell">
      <aside class="docs-sidebar" aria-label="文档导航">
        ${[...groups.entries()]
          .map(
            ([group, items]) => `
            <div class="docs-group">
              <div class="docs-group-title">${esc(group)}</div>
              <div class="docs-group-items">
                ${items
                  .map(
                    (item) =>
                      `<a class="docs-nav-link ${item.id === current.id ? 'active' : ''}" href="#/docs/${esc(item.id)}">${esc(item.shortTitle)}</a>`,
                  )
                  .join('')}
              </div>
            </div>
          `,
          )
          .join('')}
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">
          <a class="btn btn-secondary btn-sm" style="width:100%;" href="#/api/get_login_info">${icon('terminal', 14)}<span>打开 API 调试台</span></a>
        </div>
      </aside>

      <article class="docs-article">
        <div class="docs-breadcrumb">
          <span>${esc(current.group)} / <strong>${esc(current.title)}</strong></span>
          <span class="mono" style="font-size:11.5px;">${esc(current.sourceFile)}</span>
        </div>
        <div class="docs-body">${current.html}</div>
        <nav class="docs-pager" aria-label="上下篇文档">
          <div>
            ${
              prev
                ? `<a class="pager-card" href="#/docs/${esc(prev.id)}"><small>上一篇</small><strong>${esc(prev.title)}</strong></a>`
                : ''
            }
          </div>
          <div>
            ${
              next
                ? `<a class="pager-card next" href="#/docs/${esc(next.id)}"><small>下一篇</small><strong>${esc(next.title)}</strong></a>`
                : ''
            }
          </div>
        </nav>
      </article>

      <aside class="docs-toc" aria-label="本页目录">
        <div class="docs-toc-title">本页目录</div>
        ${
          current.toc.length
            ? current.toc
                .map(
                  (h) =>
                    `<a class="lvl-${h.level}" data-toc-slug="${esc(h.slug)}" href="#/docs/${esc(current.id)}/${encodeURIComponent(h.slug)}">${esc(h.text)}</a>`,
                )
                .join('')
            : '<div style="color:var(--muted);font-size:12px;">当前页面无子章节</div>'
        }
      </aside>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('.doc-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.copy ?? '';
      void copyToClipboard(code, '代码已复制');
    });
  });

  if (anchor) {
    const decoded = decodeURIComponent(anchor);
    const target = document.getElementById(decoded);
    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  } else {
    window.scrollTo({ top: 0 });
  }
}

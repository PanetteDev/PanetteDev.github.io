import './styles/base.css';
import './styles/pages.css';
import rawData from './generated/site-data.json';
import { SITE_CONFIG } from './site-config.ts';
import type { SiteData } from './types.ts';
import { createSearchModal } from './components/search-modal.ts';
import { renderLanding } from './views/landing.ts';
import { renderDocs } from './views/docs.ts';
import { cleanupApiStudio, renderApiStudio } from './views/api-studio.ts';
import { renderSchema } from './views/schema.ts';
import { esc } from './utils/format.ts';
import { icon } from './utils/icons.ts';

const data = rawData as unknown as SiteData;
const app = document.getElementById('app')!;
const search = createSearchModal(data);

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function toggleTheme(): void {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('panette-site-theme', next);
  } catch {
    /* ignore */
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = icon(next === 'dark' ? 'sun' : 'moon', 15);
}

function mountShell(): HTMLElement {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand-link" href="#/">
          <img class="brand-mascot" src="./assets/mascot.png" alt="${esc(SITE_CONFIG.mascotName)}" />
          <span>${esc(SITE_CONFIG.brandName)}</span>
        </a>

        <nav class="nav-links" aria-label="主导航">
          <a class="nav-item" data-nav="home" href="#/">首页</a>
          <a class="nav-item" data-nav="docs" href="#/docs/overview">使用文档</a>
          <a class="nav-item" data-nav="api" href="#/api/send_group_msg">API 调试台</a>
          <a class="nav-item" data-nav="schema" href="#/schema">事件与消息段</a>
        </nav>

        <div class="topbar-right">
          <button type="button" class="search-trigger" id="open-search-btn" aria-label="搜索文档和接口">
            ${icon('search', 14)}
            <span>搜索文档与接口</span>
            <kbd>Ctrl K</kbd>
          </button>
          <a class="icon-btn" href="${esc(SITE_CONFIG.links.openapiSpec)}" download="panette-openapi-3.1.json" title="下载 OpenAPI 3.1（导入 Apifox）">${icon('download', 15)}</a>
          <button type="button" class="icon-btn" id="theme-toggle-btn" title="切换日间/夜间主题">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 15)}</button>
          <a class="icon-btn" href="${esc(SITE_CONFIG.links.github)}" target="_blank" rel="noopener noreferrer" title="GitHub">${icon('github', 15)}</a>
        </div>
      </div>
    </header>
    <main id="page-root"></main>
  `;

  document.getElementById('open-search-btn')?.addEventListener('click', () => search.open());
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
  return document.getElementById('page-root')!;
}

const pageRoot = mountShell();

function setActiveNav(key: string): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === key);
  });
}

let lastPageKey = '';

function animatePage(key: string): void {
  if (key === lastPageKey) return;
  lastPageKey = key;
  pageRoot.classList.remove('page-enter');
  void pageRoot.offsetWidth;
  pageRoot.classList.add('page-enter');
}

function route(): void {
  const hash = (location.hash || '#/').replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  const head = parts[0] || '';

  if (head !== 'api') cleanupApiStudio();

  if (head === 'docs') {
    setActiveNav('docs');
    renderDocs(pageRoot, data, parts[1] || 'overview', parts[2]);
    animatePage(`docs:${parts[1] || 'overview'}`);
    return;
  }
  if (head === 'api') {
    setActiveNav('api');
    renderApiStudio(pageRoot, data, parts[1] ? decodeURIComponent(parts[1]) : undefined);
    animatePage('api');
    return;
  }
  if (head === 'schema') {
    setActiveNav('schema');
    renderSchema(pageRoot, data);
    animatePage('schema');
    return;
  }

  setActiveNav('home');
  renderLanding(pageRoot, data);
  animatePage('home');
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
route();

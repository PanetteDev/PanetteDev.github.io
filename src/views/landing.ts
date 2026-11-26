import { SITE_CONFIG } from '../site-config.ts';
import type { SiteData } from '../types.ts';
import { esc } from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

export function renderLanding(container: HTMLElement, _data: SiteData): void {
  container.innerHTML = `
    <div class="landing landing-minimal">
      <section class="hero hero-minimal">
        <div class="hero-copy">
          <div class="hero-eyebrow">
            <span class="eyebrow-dot"></span>
            <span>QQ NT · OneBot v11</span>
          </div>

          <h1 class="wordmark-heading" aria-label="Panette">
            <img class="wordmark-img wordmark-light" src="./assets/panette-wordmark-light.png" alt="Panette" />
            <img class="wordmark-img wordmark-dark" src="./assets/panette-wordmark-dark.png" alt="Panette" />
          </h1>

          <p class="hero-tagline">轻量、现代的 QQ NT OneBot 协议端</p>

          <p class="hero-sub">
            支持本机客户端与无客户端纯协议两种模式，单服务跨平台托管多账号，开箱即用。
          </p>

          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/docs/installation"><span>快速开始</span>${icon('arrow-right', 15)}</a>
            <a class="btn btn-secondary btn-lg" href="#/api/send_group_msg">${icon('terminal', 15)}<span>API 调试台</span></a>
            <a class="btn btn-ghost btn-lg" href="${esc(SITE_CONFIG.links.releases)}" target="_blank" rel="noopener noreferrer"><span>Releases</span>${icon('external', 13)}</a>
          </div>
        </div>

        <div class="hero-art-wrap">
          <div class="hero-art-aura" aria-hidden="true"></div>
          <img class="hero-art" src="./assets/hero-xiaomianbao.png?v=3" alt="Panette 小面包立绘" />
          <div class="hero-art-shadow" aria-hidden="true"></div>
        </div>
      </section>

      <div class="landing-bottom">
        <section class="pillars" aria-label="核心特性">
          <a class="pillar" href="#/docs/pure-protocol">
            <div class="pillar-head">${icon('layers', 15)}<span>双引擎自由混跑</span></div>
            <p>按需选择本机 QQ、Linux 无头或免客户端纯协议，多账号数据完全隔离。</p>
          </a>
          <a class="pillar" href="#/docs/api-onebot">
            <div class="pillar-head">${icon('radio', 15)}<span>完整协议能力</span></div>
            <p>标准 HTTP / 正反向 WebSocket 接入，覆盖消息、群管、文件闪传与音视频通话。</p>
          </a>
          <a class="pillar" href="#/docs/configuration">
            <div class="pillar-head">${icon('sliders', 15)}<span>一体化 WebUI</span></div>
            <p>扫码登录、网络配置热生效、实时日志与在线接口调试，打开浏览器即管。</p>
          </a>
        </section>

        <footer class="site-footer">
          <div>
            <strong>${esc(SITE_CONFIG.brandName)}</strong> · MIT · ${esc(SITE_CONFIG.notice.footerDisclaimer)}
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;">
            <a href="#/docs/overview">使用文档</a>
            <a href="#/api/send_group_msg">API 调试台</a>
            <a href="#/schema">事件与消息段</a>
            <a href="${esc(SITE_CONFIG.links.openapiSpec)}" download="panette-openapi-3.1.json">OpenAPI 3.1</a>
            <a href="${esc(SITE_CONFIG.links.github)}" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </footer>
      </div>
    </div>
  `;
}

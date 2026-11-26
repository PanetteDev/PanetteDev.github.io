import { SITE_CONFIG } from '../site-config.ts';
import type { SiteData } from '../types.ts';
import { esc } from '../utils/format.ts';
import { icon } from '../utils/icons.ts';

export function renderLanding(container: HTMLElement, data: SiteData): void {
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

          <p class="hero-tagline">原生注入与零 QQ 进程 Pure 双引擎协议端</p>

          <p class="hero-sub">
            单服务端混合托管多账号，完整支持消息、群管、实时 <code>rkey</code> 媒体、闪传与语音视频通话，内置 WebUI 与交互式接口文档。
          </p>

          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/docs/installation"><span>快速开始</span>${icon('arrow-right', 15)}</a>
            <a class="btn btn-secondary btn-lg" href="#/api/send_group_msg">${icon('terminal', 15)}<span>API 调试台</span></a>
            <a class="btn btn-ghost btn-lg" href="${esc(SITE_CONFIG.links.releases)}" target="_blank" rel="noopener noreferrer"><span>Releases</span>${icon('external', 13)}</a>
          </div>
        </div>

        <div class="hero-art-wrap">
          <div class="hero-art-aura" aria-hidden="true"></div>
          <img class="hero-art" src="./assets/hero-xiaomianbao.png?v=2" alt="Panette 大小面包与 Q 版小面包" />
          <div class="hero-art-shadow" aria-hidden="true"></div>
        </div>
      </section>

      <div class="landing-bottom">
        <section class="pillars" aria-label="核心特性">
          <a class="pillar" href="#/docs/pure-protocol">
            <div class="pillar-head">${icon('layers', 15)}<span>原生注入 × Pure 纯协议</span></div>
            <p>Windows、Linux Headless 与零 QQ 进程纯协议同台混跑，账号数据完全隔离。</p>
          </a>
          <a class="pillar" href="#/docs/api-onebot">
            <div class="pillar-head">${icon('radio', 15)}<span>全链路 OneBot v11</span></div>
            <p>HTTP、正反向 WebSocket、实时 <code>rkey</code> 补签、闪传、群相册与语音视频通话。</p>
          </a>
          <a class="pillar" href="#/api/send_group_msg">
            <div class="pillar-head">${icon('file-code', 15)}<span>交互调试台与 OpenAPI 3.1</span></div>
            <p>内置 ${data.stats.actionCount} 个公开动作、${data.stats.eventCount} 类主动上报事件与直连端点，可在线调试或导入 Apifox。</p>
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

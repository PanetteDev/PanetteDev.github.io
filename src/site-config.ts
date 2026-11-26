/**
 * Panette 官网集中外链与站点配置
 * 后续切换自定义域名、开放社区群或修改下载镜像，只需改这一个文件。
 */
export const SITE_CONFIG = {
  brandName: 'Panette',
  mascotName: '小面包',
  tagline: 'QQ NT 的 OneBot v11 协议端 · 原生注入 × 零 QQ 进程纯协议混合多开',
  description:
    '通过原生组件或内置纯协议栈连接 QQ，提供消息收发、群管理、文件闪传、实时 rkey 媒体与语音视频通话接口，附带现代化 WebUI 管理控制台。',
  links: {
    github: 'https://github.com/PanetteDev/Panette',
    releases: 'https://github.com/PanetteDev/Panette/releases',
    issues: 'https://github.com/PanetteDev/Panette/issues',
    ghcr: 'ghcr.io/panettedev/panette',
    openapiSpec: './openapi.json',
    communityLabel: '问题反馈 / Discussions',
    communityUrl: 'https://github.com/PanetteDev/Panette/issues',
  },
  defaults: {
    onebotBaseUrl: 'http://127.0.0.1:3001',
    onebotWsUrl: 'ws://127.0.0.1:3001/ws',
    webuiUrl: 'http://127.0.0.1:6099/webui',
  },
  notice: {
    showPrereleaseBadge: true,
    badgeLabel: 'RC 预览版',
    footerDisclaimer: '本项目与腾讯无关，不分发 QQ 客户端。请遵守 QQ 用户协议及适用法律。',
  },
} as const;

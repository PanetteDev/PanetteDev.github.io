# Panette Official Site & API Studio

Panette（QQ NT OneBot v11 协议端）官方网站、使用文档中心与 Apifox 风格交互式 API 调试台。

## 特性

- **官网首页**：产品介绍、原生注入 vs Pure 纯协议架构选型、Windows / Linux Headless / Docker / Pure 快速部署向导、小面包（Xiaomianbao）品牌双主题视觉。
- **使用文档中心**：直接从主仓库 `docs/` 自动编译生成，带三级目录树、本页 TOC、一键复制代码块与 `Ctrl+K` 全局搜索。
- **Apifox 风格 API 调试台**：
  - 全部公开 OneBot v11 动作（自动排除 `release-exclude-actions.json` 裁剪的内部动作）
  - 主动上报事件（WebSocket / HTTP Push）独立分类 + 浏览器直连 WS 实时事件监听器与模拟推送
  - 运维与媒体直连 HTTP 端点（`/healthz`、`/metrics`、`/voice/stream`、`/voice/silk`、`/voice/say`）
  - 表单 ↔ JSON Body 双向同步、本地实连 + Mock 预览、多语言代码实时生成（cURL / PowerShell / JS / Python / WS）
  - 自动生成标准 **OpenAPI 3.1.0**（`public/openapi.json`，含原生 `webhooks`），可直接下载并导入 Apifox / Postman。

## 本地开发与同步

```bash
# 安装依赖
npm install

# 从主仓库同步最新 docs/、品牌素材与 openapi.json（默认读取 ../wyhlulema）
npm run sync
# 或指定主仓库路径：
# PANETTE_REPO=D:\wyhlulema npm run sync

# 启动本地开发服务器
npm run dev

# 类型检查与静态构建（产物在 dist/，可部署到 GitHub Pages / Cloudflare Pages / VPS Nginx）
npm run typecheck
npm run build
```

## 外链与站点配置

所有仓库地址、Releases 链接、默认 OneBot 地址与页脚声明均集中在 `src/site-config.ts`，按需修改即可。

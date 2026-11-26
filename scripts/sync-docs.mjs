#!/usr/bin/env node
/**
 * Sync public documentation, brand assets, OneBot v11 actions, direct HTTP endpoints,
 * push events (webhooks), message segments, and an Apifox-ready OpenAPI 3.1.0 spec
 * from the Panette main repository into D:\panette-site.
 *
 * Usage:
 *   node scripts/sync-docs.mjs
 *   PANETTE_REPO=D:\wyhlulema node scripts/sync-docs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(process.env.PANETTE_REPO || path.resolve(SITE_ROOT, '../wyhlulema'));

function readText(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[\p{P}\p{S}]/gu, (c) => (c === '-' || c === '_' ? c : ''))
    .trim()
    .replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// 1. Sync brand assets
// ---------------------------------------------------------------------------
function syncAssets() {
  const destAssets = path.join(SITE_ROOT, 'public/assets');
  ensureDir(destAssets);
  const copies = [
    ['server/webui-src/public/mascot.png', 'public/assets/mascot.png'],
    ['server/webui-src/public/favicon.png', 'public/favicon.png'],
    ['server/webui-src/public/favicon.ico', 'public/favicon.ico'],
  ];
  for (const [srcRel, dstRel] of copies) {
    const src = path.join(REPO_ROOT, srcRel);
    const dst = path.join(SITE_ROOT, dstRel);
    if (fs.existsSync(src)) {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Clean GFM Markdown -> HTML renderer (zero external deps)
// ---------------------------------------------------------------------------
const DOC_DEFS = [
  { id: 'overview', file: 'docs/README.md', group: '开始使用', title: '文档总览', shortTitle: '文档总览' },
  { id: 'installation', file: 'docs/guide/installation.md', group: '开始使用', title: '安装与更新', shortTitle: '安装与更新' },
  { id: 'configuration', file: 'docs/guide/configuration.md', group: '开始使用', title: '配置、WebUI 与排错', shortTitle: '配置与排错' },
  { id: 'multi-account', file: 'docs/guide/multi-account.md', group: '进阶运行', title: '多账号与多实例', shortTitle: '多账号多实例' },
  { id: 'pure-protocol', file: 'docs/guide/pure-protocol.md', group: '进阶运行', title: '纯协议模式（Pure）', shortTitle: '纯协议模式' },
  { id: 'api-onebot', file: 'docs/api/onebot.md', group: '协议与接口手册', title: 'OneBot 接入与接口', shortTitle: 'OneBot 接入' },
  { id: 'api-messages', file: 'docs/api/messages.md', group: '协议与接口手册', title: '消息、文件与媒体', shortTitle: '消息与文件' },
  { id: 'api-calls', file: 'docs/api/calls.md', group: '协议与接口手册', title: 'QQ 语音与视频通话', shortTitle: 'QQ 语音视频通话' },
  { id: 'development', file: 'docs/development.md', group: '开发与维护', title: '开发环境与构建', shortTitle: '开发与构建' },
];

const FILE_TO_DOC_ID = new Map(DOC_DEFS.map((d) => [d.file.replace(/\\/g, '/'), d.id]));

function rewriteDocLink(href, sourceFile) {
  if (/^(https?:|mailto:|#)/i.test(href)) {
    if (href.startsWith('#')) {
      const currentId = FILE_TO_DOC_ID.get(sourceFile);
      return currentId ? `#/docs/${currentId}/${encodeURIComponent(decodeURIComponent(href.slice(1)))}` : href;
    }
    return href;
  }
  const [rawPath, rawHash] = href.split('#', 2);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), rawPath));
  if (resolved === 'README.md') return '#/';
  const targetId = FILE_TO_DOC_ID.get(resolved);
  if (targetId) {
    return rawHash
      ? `#/docs/${targetId}/${encodeURIComponent(decodeURIComponent(rawHash))}`
      : `#/docs/${targetId}`;
  }
  return `https://github.com/PanetteDev/Panette/blob/main/${resolved}${rawHash ? '#' + rawHash : ''}`;
}

function renderInline(text, sourceFile) {
  const codeSpans = [];
  let s = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });
  s = escapeHtml(s);
  // Images
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const cleanSrc = src.trim();
    const mapped = cleanSrc.endsWith('banner.png')
      ? './assets/banner.png'
      : cleanSrc.endsWith('xiaomianbao.png')
        ? './assets/xiaomianbao.png'
        : cleanSrc;
    return `<img src="${escapeHtml(mapped)}" alt="${alt}" loading="lazy" class="doc-img" />`;
  });
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const target = rewriteDocLink(href.trim(), sourceFile);
    const external = /^https?:\/\//i.test(target);
    return `<a href="${escapeHtml(target)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  // Bold & italic
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeSpans[Number(idx)]);
  return s;
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += trimmed[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function renderMarkdown(md, sourceFile) {
  const lines = md.split('\n');
  const toc = [];
  const usedSlugs = new Map();
  const out = [];
  let i = 0;

  // Strip the top breadcrumb link line (e.g. `[文档首页](../README.md) · ...`) right after H1
  const filteredLines = [];
  let seenH1 = false;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!seenH1 && /^#\s+/.test(line)) {
      seenH1 = true;
      filteredLines.push(line);
      continue;
    }
    if (seenH1 && filteredLines.length <= 3 && /^\[.+?\]\(.+?\)\s*·/.test(line.trim())) {
      continue;
    }
    filteredLines.push(line);
  }

  const L = filteredLines;
  let detailsDepth = 0;
  while (i < L.length) {
    const line = L[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    const fence = /^(`{3,}|~{3,})(.*)$/.exec(line.trim());
    if (fence) {
      const marker = fence[1];
      const lang = fence[2].trim() || 'text';
      const codeLines = [];
      i++;
      while (i < L.length && !(L[i].trim().startsWith(marker) && L[i].trim().length >= marker.length && !L[i].trim().slice(marker.length).trim())) {
        codeLines.push(L[i]);
        i++;
      }
      if (i < L.length) i++;
      const codeRaw = codeLines.join('\n');
      out.push(
        `<div class="doc-code"><div class="doc-code-head"><span class="doc-code-lang">${escapeHtml(lang)}</span><button type="button" class="doc-copy-btn" data-copy="${escapeHtml(codeRaw)}">复制</button></div><pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(codeRaw)}</code></pre></div>`,
      );
      continue;
    }

    // Raw HTML <details> / </details> / <summary>
    if (/^<\/?(details|summary)\b/i.test(line.trim())) {
      const t = line.trim();
      if (/^<details\b/i.test(t)) {
        detailsDepth++;
        out.push('<details class="doc-details">');
      } else if (/^<\/details>/i.test(t)) {
        detailsDepth = Math.max(0, detailsDepth - 1);
        out.push('</div></details>');
      } else if (/^<summary\b/i.test(t)) {
        const inner = t.replace(/^<summary[^>]*>/i, '').replace(/<\/summary>$/i, '');
        out.push(`<summary>${renderInline(inner, sourceFile)}</summary><div class="doc-details-body">`);
      } else {
        out.push(t);
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const rawText = heading[2].trim();
      const baseSlug = slugify(rawText);
      const dup = usedSlugs.get(baseSlug) ?? 0;
      const slug = dup === 0 ? baseSlug : `${baseSlug}-${dup}`;
      usedSlugs.set(baseSlug, dup + 1);
      if (detailsDepth === 0 && level >= 2 && level <= 3) {
        toc.push({ level, text: rawText.replace(/`([^`]+)`/g, '$1'), slug });
      }
      out.push(
        `<h${level} id="${escapeHtml(slug)}" class="doc-h${level}">${renderInline(rawText, sourceFile)}<a class="doc-anchor" href="#/docs/${FILE_TO_DOC_ID.get(sourceFile)}/${encodeURIComponent(slug)}" aria-label="锚点">#</a></h${level}>`,
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const bqLines = [];
      while (i < L.length && L[i].trim().startsWith('>')) {
        bqLines.push(L[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote class="doc-callout">${bqLines.map((l) => `<p>${renderInline(l, sourceFile)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // GFM Table
    if (line.trim().startsWith('|') && i + 1 < L.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(L[i + 1].trim())) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < L.length && L[i].trim().startsWith('|')) {
        rows.push(splitTableRow(L[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h, sourceFile)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, sourceFile)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      out.push(`<div class="doc-table-wrap"><table class="doc-table">${thead}${tbody}</table></div>`);
      continue;
    }

    // Unordered or ordered list
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < L.length && /^\s*([-*+]|\d+\.)\s+/.test(L[i])) {
        let itemText = L[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        i++;
        while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(L[i])) {
          itemText += ' ' + L[i].trim();
          i++;
        }
        items.push(`<li>${renderInline(itemText, sourceFile)}</li>`);
      }
      out.push(`<${tag} class="doc-list">${items.join('')}</${tag}>`);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < L.length &&
      L[i].trim() &&
      !/^(`{3,}|~{3,})/.test(L[i].trim()) &&
      !/^#{1,6}\s+/.test(L[i]) &&
      !/^>/.test(L[i].trim()) &&
      !/^\|/.test(L[i].trim()) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(L[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(L[i].trim()) &&
      !/^<\/?(details|summary)\b/i.test(L[i].trim())
    ) {
      paraLines.push(L[i].trim());
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${renderInline(paraLines.join(' '), sourceFile)}</p>`);
    }
  }

  const plainText = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { html: out.join('\n'), toc, excerpt: plainText.slice(0, 220), searchText: plainText.slice(0, 3000) };
}

// ---------------------------------------------------------------------------
// 3. Structured Action Parser from docs/api/{onebot,messages,calls}.md
// ---------------------------------------------------------------------------
function parseParamSpec(rawParamText) {
  const clean = rawParamText.trim();
  if (!clean || clean === '无' || clean === '任意') return [];

  const params = [];
  const seen = new Set();

  // Match every backticked param expression like `name?:type=default` followed by optional parenthetical note
  const re = /`([^`]+)`(?:\s*（([^）]+)）)?/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const token = m[1].trim();
    const paren = (m[2] || '').trim();

    // Skip alias names that appear inside parenthetical notes (already handled via paren)
    const before = clean.slice(Math.max(0, m.index - 10), m.index);
    if (/别名\s*$/.test(before) || /或\s*$/.test(before) && /^[a-z_]+$/.test(token) && seen.has(token)) {
      continue;
    }

    // Parse token: `field_name?:type=default`
    const parsed = /^([a-zA-Z_][\w.]*)(\?)?(?::([^=]+))?(?:=(.+))?$/.exec(token);
    if (!parsed) continue;
    const [, name, optMark, rawType, rawDefault] = parsed;
    if (seen.has(name)) continue;
    seen.add(name);

    const optional = Boolean(optMark) || /可选/.test(before);
    let type = (rawType || '').trim();
    if (!type) {
      if (/(group_id|user_id|uin|count|duration|size|start|pos|num|page|timeout|time|port|id)$/.test(name) && name !== 'file_id' && name !== 'folder_id' && name !== 'album_id' && name !== 'fileset_id' && name !== 'room_id' && name !== 'notice_id' && name !== 'emoji_id' && name !== 'flag' && name !== 'tid' && name !== 'uid') {
        type = name === 'message_id' ? 'number | string' : 'number';
      } else if (name === 'message') {
        type = 'string | MessageSegment[]';
      } else if (name === 'messages') {
        type = 'ForwardNode[]';
      } else {
        type = 'string';
      }
    }

    const aliases = [];
    if (paren) {
      for (const am of paren.matchAll(/别名\s*([^，；;]+)/g)) {
        for (const a of am[1].matchAll(/`?([a-zA-Z_][\w]*)`?/g)) {
          aliases.push(a[1]);
        }
      }
    }

    let defaultVal;
    if (rawDefault !== undefined) {
      const dv = rawDefault.trim();
      if (dv === 'true') defaultVal = true;
      else if (dv === 'false') defaultVal = false;
      else if (/^-?\d+(\.\d+)?$/.test(dv)) defaultVal = Number(dv);
      else if ((dv.startsWith('"') && dv.endsWith('"')) || (dv.startsWith("'") && dv.endsWith("'"))) {
        defaultVal = dv.slice(1, -1);
      } else {
        defaultVal = dv;
      }
    }

    params.push({
      name,
      type,
      required: !optional,
      defaultValue: defaultVal,
      aliases,
      description: paren || inferParamDescription(name),
    });
  }

  return params;
}

function inferParamDescription(name) {
  const dict = {
    user_id: '目标 QQ 号（数字或十进制字符串）',
    group_id: '目标群号（数字或十进制字符串）',
    message_id: '本服务台账消息 ID',
    message: '文本字符串（支持 CQ 码）或消息段数组',
    messages: '合并转发节点数组（引用已有 message_id）',
    message_type: '会话类型：private（私聊）或 group（群聊）',
    count: '拉取条数上限',
    fresh: '是否跳过缓存强制向服务端刷新',
    no_cache: '是否跳过缓存强制刷新',
    file: '文件路径、file://、base64:// 或 HTTP(S) URL',
    file_id: '群文件或媒体远端 file_id',
    folder_id: '群文件夹 ID（根目录为 "/"）',
    album_id: '群相册 ID',
    fileset_id: 'QQ 闪传文件集 ID',
    flag: '申请记录中的 flag 标识',
    approve: '是否同意（true 同意 / false 拒绝）',
    remark: '备注名称',
    duration: '时长（秒）',
    enable: '是否开启',
    card: '群名片内容',
    group_name: '新的群名称',
    content: '正文内容',
    emoji_id: 'QQ 表情 / Emoji ID',
    tid: 'QQ 空间说说 tid',
    room_id: '通话房间 ID',
    video: '是否为视频通话',
    timeout: '超时时间（毫秒）',
    uid: 'QQ NT u_... 标识',
  };
  return dict[name] || '';
}

function sampleValueForParam(p) {
  if (p.defaultValue !== undefined) return p.defaultValue;
  const n = p.name;
  if (n === 'group_id') return 100001;
  if (n === 'user_id') return 10001;
  if (n === 'message_id') return 1001;
  if (n === 'message') return [{ type: 'text', data: { text: '你好，这是一条来自 Panette 的测试消息' } }];
  if (n === 'messages') return [{ type: 'node', data: { id: '1001' } }];
  if (n === 'emoji_id') return '76';
  if (n === 'card') return '小面包助手';
  if (n === 'group_name') return 'Panette 测试群';
  if (n === 'content') return '这是一条测试内容';
  if (n === 'text') return '你好，我是小面包';
  if (n === 'title') return 'Panette 分享卡片';
  if (n === 'desc') return 'QQ NT OneBot v11 协议端';
  if (n === 'url' || n === 'jump_url' || n === 'picUrl') return 'https://example.com';
  if (n === 'file' || n === 'wav_path' || n === 'source') return '/data/sample.png';
  if (n === 'words') return ['hello', 'world'];
  if (n === 'context') return { post_type: 'message', message_type: 'group', group_id: 100001, message_id: 1001 };
  if (n === 'operation') return { reply: '已收到！' };
  if (/boolean/.test(p.type)) return false;
  if (/number/.test(p.type)) return 1;
  if (/\[\]/.test(p.type)) return [];
  if (/object/.test(p.type)) return {};
  return `<${n}>`;
}

function buildDefaultRequestBody(actionName, params) {
  const custom = {
    send_group_msg: { group_id: 100001, message: [{ type: 'text', data: { text: '你好，Panette！' } }] },
    send_private_msg: { user_id: 10001, message: [{ type: 'text', data: { text: '私聊测试消息' } }] },
    send_msg: { message_type: 'group', group_id: 100001, message: 'Hello from Panette' },
    get_group_msg_history: { group_id: 100001, count: 20 },
    get_friend_msg_history: { user_id: 10001, count: 20 },
    set_msg_emoji_like: { message_id: 1001, emoji_id: '76', set: true },
    voice_call_config: { listen: true, auto_accept: false, media_quality: 'high' },
    voice_call_start: { user_id: 10001, video: false, wait_accept: true, timeout: 45000 },
    voice_call_video_play: { source: '/data/demo.mp4', size: '960x720', fps: 20, fit: 'pad', loop: true },
  };
  if (custom[actionName]) return custom[actionName];
  const body = {};
  for (const p of params) {
    if (p.required || params.length <= 3) {
      body[p.name] = sampleValueForParam(p);
    }
  }
  return body;
}

function buildMockResponse(action) {
  const presets = {
    get_version_info: { app_name: 'Panette', app_version: '1.0.0-rc.1', protocol_version: 'v11' },
    get_login_info: { user_id: 10000, nickname: '小面包', uid: 'u_demo_panette' },
    get_status: {
      online: true,
      good: true,
      app_name: 'Panette',
      app_version: '1.0.0-rc.1',
      health: { ready: true, mode: 'packet' },
      transport: { addresses: [{ address: '0.0.0.0:3001', clients: 1 }], reverse: [] },
    },
    send_group_msg: { ok: true, message_id: 1042, parts: 1 },
    send_private_msg: { ok: true, message_id: 1043, parts: 1 },
    send_msg: { ok: true, message_id: 1044, parts: 1 },
    get_group_list: [
      { group_id: 100001, group_name: 'Panette 开发交流群', member_count: 128, max_member_count: 500 },
    ],
    get_friend_list: [
      { user_id: 10001, uid: 'u_demo_friend', nickname: '测试好友', remark: '小面包', category_id: 0, synthetic: false },
    ],
    get_rkey: {
      rkeys: [{ type: 'group', rkey_type: 20, rkey: '&rkey=DEMO_GROUP_RKEY', ttl: 3600 }],
      private_rkey: '&rkey=DEMO_PRIVATE_RKEY',
      group_rkey: '&rkey=DEMO_GROUP_RKEY',
      expired_time: Math.floor(Date.now() / 1000) + 3600,
    },
    voice_call_query: {
      active: false,
      state: 'IDLE',
      peer_connected: false,
      pending_invite: null,
      codec_ready: true,
      codec_backend: 'avsdk',
    },
  };
  const data = presets[action.name] !== undefined
    ? presets[action.name]
    : /^`null`/.test(action.returnsRaw.trim())
      ? null
      : { ok: true, note: action.returns };
  return {
    status: 'ok',
    retcode: 0,
    data,
    message: '',
  };
}

function parseActionsFromDoc(filePath, docId, excludedSet) {
  const md = readText(filePath);
  const lines = md.split('\n');
  let h2 = '';
  let h3 = '';
  const actions = [];
  const subTablesByHeading = new Map();

  // First pass: capture parameter sub-tables (like `来电设置` & `来源参数` & `动作别名` in calls.md)
  for (let i = 0; i < lines.length; i++) {
    const hm = /^(#{2,3})\s+(.+)$/.exec(lines[i]);
    if (hm) {
      if (hm[1] === '##') { h2 = hm[2].trim(); h3 = ''; }
      else h3 = hm[2].trim();
      continue;
    }
    if (lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
      const headers = splitTableRow(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      const key = `${h2}::${h3}::${headers[0]}`;
      subTablesByHeading.set(key, { headers, rows });
      i = j - 1;
    }
  }

  // Parse voice_call aliases if present
  const aliasMap = new Map();
  const aliasTable = subTablesByHeading.get('拨打与接听::动作别名::常用名称');
  if (aliasTable) {
    for (const r of aliasTable.rows) {
      const main = (r[0].match(/`([^`]+)`/) || [])[1];
      const al = (r[1].match(/`([^`]+)`/) || [])[1];
      if (main && al) aliasMap.set(main, [...(aliasMap.get(main) || []), al]);
    }
  }

  // Special sub-table params for voice_call_config & voice_call_video_play
  function paramsFromTwoColTable(tbl) {
    if (!tbl) return [];
    return tbl.rows.map((r) => {
      const nameRaw = (r[0].match(/`([^`]+)`/) || [])[1] || r[0].trim();
      const parsed = parseParamSpec(`\`${nameRaw}\``)[0] || {
        name: nameRaw.replace(/\?$/, ''),
        type: 'string',
        required: !nameRaw.endsWith('?'),
        aliases: [],
      };
      const desc = r[1].replace(/`([^`]+)`/g, '$1').trim();
      let type = parsed.type;
      if (/布尔值/.test(desc)) type = 'boolean';
      else if (/毫秒|帧率|码率|数字/.test(desc)) type = 'number';
      return { ...parsed, type, description: desc };
    });
  }

  const callConfigParams = paramsFromTwoColTable(subTablesByHeading.get('准备通话环境::来电设置::参数'));
  const callVideoParams = paramsFromTwoColTable(subTablesByHeading.get('视频来源::::来源参数'));

  // Second pass: collect action tables + section notes + example JSON
  h2 = '';
  h3 = '';
  for (let i = 0; i < lines.length; i++) {
    const hm = /^(#{2,3})\s+(.+)$/.exec(lines[i]);
    if (hm) {
      if (hm[1] === '##') { h2 = hm[2].trim(); h3 = ''; }
      else h3 = hm[2].trim();
      continue;
    }

    if (lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
      const headers = splitTableRow(lines[i]);
      if (headers[0] !== '动作') continue;

      let j = i + 2;
      const rows = [];
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }

      // Grab up to 2 short note paragraphs after the table until next heading/table (skipping code blocks & details)
      const notes = [];
      let k = j;
      let inFence = false;
      let inDetails = false;
      while (k < lines.length && !/^#{1,3}\s+/.test(lines[k]) && !lines[k].trim().startsWith('|')) {
        const ln = lines[k].trim();
        if (/^(`{3,}|~{3,})/.test(ln)) {
          inFence = !inFence;
          k++;
          continue;
        }
        if (/^<details\b/i.test(ln)) {
          inDetails = true;
          k++;
          continue;
        }
        if (/^<\/details>/i.test(ln)) {
          inDetails = false;
          k++;
          continue;
        }
        if (!inFence && !inDetails && ln && !ln.startsWith('<summary') && !ln.startsWith('>')) {
          const cleaned = ln.replace(/^[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1');
          if (notes.length < 2 && cleaned.length >= 6 && cleaned.length < 260 && !/^[{[\]}]/.test(cleaned)) {
            notes.push(cleaned);
          }
        }
        k++;
      }

      let prevParams = [];
      let prevReturns = '';
      for (const r of rows) {
        const names = [...r[0].matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
        if (!names.length) continue;

        // Filter out excluded internal actions
        const visibleNames = names.filter((n) => !excludedSet.has(n));
        if (!visibleNames.length) continue;

        const primary = visibleNames[0];
        const aliases = [...visibleNames.slice(1), ...(aliasMap.get(primary) || [])];
        const rawParamCell = r[1] || '';
        const rawReturnCell = r[2] || '';

        let params;
        if (primary === 'voice_call_config') {
          params = callConfigParams;
        } else if (primary === 'voice_call_video_play') {
          params = callVideoParams;
        } else if (/^同上/.test(rawParamCell.trim())) {
          params = [...prevParams, ...parseParamSpec(rawParamCell.replace(/^同上[，,；;\s]*/, ''))];
        } else if (/其余同上/.test(rawParamCell)) {
          const own = parseParamSpec(rawParamCell);
          const ownNames = new Set(own.map((p) => p.name));
          params = [...own, ...prevParams.filter((p) => !ownNames.has(p.name) && p.name !== 'group_id' && p.name !== 'user_id')];
        } else if (/其余同根目录查询/.test(rawParamCell)) {
          const own = parseParamSpec(rawParamCell);
          const ownNames = new Set(own.map((p) => p.name));
          params = [...own, ...prevParams.filter((p) => !ownNames.has(p.name))];
        } else {
          params = parseParamSpec(rawParamCell);
        }

        const returnsRaw = /^同上/.test(rawReturnCell.trim())
          ? rawReturnCell.replace(/^同上/, prevReturns)
          : rawReturnCell;
        prevParams = params;
        prevReturns = returnsRaw;

        const category = chooseCategory(docId, h2, h3, primary);
        const summary = deriveSummary(primary, returnsRaw, h3 || h2);
        const exampleBody = buildDefaultRequestBody(primary, params);

        const actionObj = {
          id: primary,
          kind: 'action',
          method: 'POST',
          path: `/${primary}`,
          name: primary,
          aliases: [...new Set(aliases)],
          category,
          section: h3 || h2,
          docId,
          docAnchor: slugify(h3 || h2),
          summary,
          paramsRaw: rawParamCell,
          params,
          returnsRaw,
          returns: returnsRaw.replace(/`([^`]+)`/g, '$1'),
          notes: notes.join(' '),
          exampleBody,
        };
        actionObj.mockResponse = buildMockResponse(actionObj);
        actions.push(actionObj);
      }

      i = j - 1;
    }
  }

  // Ensure voice_call_query is included (it's documented as a heading section rather than a table row in calls.md)
  if (docId === 'api-calls' && !actions.some((a) => a.name === 'voice_call_query')) {
    const queryAct = {
      id: 'voice_call_query',
      kind: 'action',
      method: 'POST',
      path: '/voice_call_query',
      name: 'voice_call_query',
      aliases: aliasMap.get('voice_call_query') || ['get_voice_call_status'],
      category: 'QQ 语音与视频通话',
      section: '查看通话状态',
      docId: 'api-calls',
      docAnchor: slugify('查看通话状态'),
      summary: '查询当前通话状态、编解码就绪信息与音视频帧率/收发包统计',
      paramsRaw: '无',
      params: [],
      returnsRaw: '`active`、`state`、`peer_connected`、`pending_invite`、`stats`、`codec_ready` 等通话状态快照',
      returns: 'active、state、peer_connected、pending_invite、stats、codec_ready 等通话状态快照',
      notes: '空闲返回基础状态、来电信息和配置；房间及媒体统计只在活动会话中出现。',
      exampleBody: {},
    };
    queryAct.mockResponse = buildMockResponse(queryAct);
    actions.unshift(queryAct);
  }

  return actions;
}

function chooseCategory(docId, h2, h3, name) {
  if (docId === 'api-calls') return 'QQ 语音与视频通话';
  if (docId === 'api-messages') {
    if (h2.includes('发送')) return '消息收发与历史';
    if (h2.includes('查询')) return '消息收发与历史';
    if (h2.includes('合并转发')) return '合并转发';
    if (h2.includes('表情回应')) return '表情回应与已读';
    if (h3.includes('闪传')) return 'QQ 闪传（Fileset）';
    if (h3.includes('媒体')) return '媒体、rkey 与 AI 语音';
    return '群文件与下载上传';
  }
  if (h3.includes('状态与基础资料')) return '账号与状态';
  if (h3.includes('好友扩展')) return '好友与资料管理';
  if (h3.includes('列表与资料')) return '群信息与成员';
  if (h3.includes('群管理')) return '群管理操作';
  if (h3.includes('入群申请')) return '入群申请审批';
  if (h3.includes('公告')) return '群公告、精华与签到';
  if (h3.includes('相册')) return '群相册';
  if (h2.includes('空间')) return 'QQ 空间';
  if (h2.includes('快捷操作')) return '快捷操作与兼容';
  if (name.includes('ark') || name.includes('tuwen')) return 'Ark 卡片与兼容';
  return '快捷操作与兼容';
}

function deriveSummary(name, returnsRaw, section) {
  const custom = {
    get_status: '获取 QQ 在线状态、原生通道健康度与传输层连接信息',
    get_version_info: '获取 Panette 应用名称、当前版本号与 OneBot 协议版本',
    get_login_info: '获取当前登录账号的 QQ 号、昵称与 UID',
    get_friend_list: '获取好友列表（支持强制刷新与缺失昵称补查）',
    get_stranger_info: '查询任意 QQ 用户的基础资料与个性签名',
    send_like: '给指定 QQ 用户资料页点赞（单次 1–10 次）',
    set_friend_add_request: '同意或拒绝好友添加申请',
    send_private_msg: '发送私聊消息（支持文本、CQ 码或消息段数组）',
    send_group_msg: '发送群聊消息（支持文本、@、回复、图片、卡片等消息段）',
    send_msg: '统一发送私聊或群聊消息',
    get_msg: '按消息台账 ID 查询单条历史消息详情',
    delete_msg: '撤回指定消息（受 QQ 撤回时限与群权限限制）',
    get_group_msg_history: '分页拉取群聊历史消息（支持 message_seq 向前翻页）',
    get_friend_msg_history: '分页拉取私聊历史消息',
    get_rkey: '实时获取或刷新 QQ 媒体图片私聊/群聊 rkey',
    voice_call_start: '向好友发起单人 QQ 语音或视频通话',
    voice_call_accept: '接听当前呼入的 QQ 语音或视频通话',
    voice_call_leave: '挂断并离开当前通话房间',
    voice_call_config: '配置来电监听、自动接听、欢迎语音频与默认视频源',
    voice_call_video_play: '向进行中的视频通话推送本地视频/图片/RTSP/RTMP 画面',
  };
  if (custom[name]) return custom[name];
  const cleaned = returnsRaw.replace(/`([^`]+)`/g, '$1').trim();
  const afterSemi = cleaned.split('；')[1];
  if (afterSemi && afterSemi.length >= 4) return afterSemi.trim();
  return `${section} · ${cleaned.slice(0, 68)}`;
}

// ---------------------------------------------------------------------------
// 4. Direct HTTP Endpoints (non-OneBot-action routes)
// ---------------------------------------------------------------------------
const DIRECT_ENDPOINTS = [
  {
    id: 'http_healthz',
    kind: 'http',
    method: 'GET',
    path: '/healthz',
    name: 'GET /healthz',
    aliases: [],
    category: '运维与媒体直连端点',
    section: 'HTTP 探活',
    docId: 'api-onebot',
    docAnchor: 'http',
    summary: '服务健康探活端点（无需 Token，容器/负载均衡就绪检查使用）',
    auth: '无需 Token（建议仅内网/受防火墙保护访问）',
    params: [],
    returns: 'HTTP 200 表示健康；HTTP 503 表示探活异常；信息不足时 ok 为 null',
    notes: '直接访问 OneBot HTTP 端口（默认 3001），不走 OneBot 动作封装格式。',
    exampleBody: null,
    mockResponse: { ok: true, online: true, app: 'Panette', version: '1.0.0-rc.1' },
  },
  {
    id: 'http_metrics',
    kind: 'http',
    method: 'GET',
    path: '/metrics',
    name: 'GET /metrics',
    aliases: [],
    category: '运维与媒体直连端点',
    section: 'Prometheus 指标',
    docId: 'api-onebot',
    docAnchor: 'http',
    summary: '导出 Prometheus 文本格式运行指标（消息计数、连接数、通道状态）',
    auth: '复用 OneBot Bearer Token',
    params: [],
    returns: 'text/plain; version=0.0.4 Prometheus 指标文本',
    notes: '复用 OneBot HTTP 端口与同一 Token，适合接入 Prometheus / Grafana 监控面板。',
    exampleBody: null,
    mockResponse: '# HELP panette_up Panette runtime status\n# TYPE panette_up gauge\npanette_up 1\npanette_ws_clients 1\n',
  },
  {
    id: 'http_voice_stream',
    kind: 'http',
    method: 'GET',
    path: '/voice/stream',
    name: 'GET /voice/stream',
    aliases: [],
    category: '运维与媒体直连端点',
    section: 'HTTP 音频流',
    docId: 'api-calls',
    docAnchor: 'http-音频流',
    summary: '持续拉取当前通话的 16 kHz 单声道 16-bit 小端裸 PCM 实时音频流',
    auth: '复用 OneBot Bearer Token',
    params: [],
    returns: '响应头 audio/L16;rate=16000;channels=1，持续输出无 WAV 头的 PCM 二进制流',
    notes: '可直接管道送入 ASR（语音识别）或实时音频处理程序，不使用 OneBot 动作外层。',
    exampleBody: null,
    mockResponse: '<binary audio/L16;rate=16000;channels=1 stream>',
  },
  {
    id: 'http_voice_silk',
    kind: 'http',
    method: 'GET',
    path: '/voice/silk',
    name: 'GET /voice/silk',
    aliases: [],
    category: '运维与媒体直连端点',
    section: 'HTTP 音频流',
    docId: 'api-calls',
    docAnchor: 'http-音频流',
    summary: '下载当前或最近一次 QQ 语音通话的录音数据',
    auth: '复用 OneBot Bearer Token',
    params: [],
    returns: '二进制音频文件；没有录音时返回 HTTP 404',
    notes: '位于 OneBot HTTP 端口，沿用同一 Token。',
    exampleBody: null,
    mockResponse: '<binary call recording>',
  },
  {
    id: 'http_voice_say',
    kind: 'http',
    method: 'POST',
    path: '/voice/say',
    name: 'POST /voice/say',
    aliases: [],
    category: '运维与媒体直连端点',
    section: 'HTTP 音频流',
    docId: 'api-calls',
    docAnchor: 'http-音频流',
    summary: '直接 POST WAV 或裸 PCM 二进制音频推入当前通话播放队列（最大 32 MiB）',
    auth: '复用 OneBot Bearer Token',
    params: [
      {
        name: 'clear',
        type: '0 | 1 (query)',
        required: false,
        defaultValue: 0,
        aliases: [],
        description: '查询参数 ?clear=1 时清空旧播放队列后立即播报',
      },
    ],
    returns: '返回 OneBot 响应外层（含入队帧数与时长信息）',
    notes: '适合将 TTS 引擎生成的 WAV/PCM 音频直接流式 POST 到通话中播放，无需先落盘。',
    exampleBody: null,
    mockResponse: { status: 'ok', retcode: 0, data: { total_frames: 95, queued_frames: 95, duration_seconds: 1.9 }, message: '' },
  },
];

// ---------------------------------------------------------------------------
// 5. Push Events / Webhooks (non-action proactive reports)
// ---------------------------------------------------------------------------
const PUSH_EVENTS = [
  {
    id: 'event_message_group',
    kind: 'event',
    method: 'EVENT',
    path: 'message.group',
    name: 'message.group',
    title: '群聊消息事件',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS (universal/event)', '反向 WS', 'HTTP 上报 (NT_REPORT_URL)'],
    discriminator: { post_type: 'message', message_type: 'group', sub_type: 'normal' },
    docId: 'api-messages',
    docAnchor: '接收消息',
    summary: '收到群聊消息时由服务端主动推送，包含完整消息段数组与发送者群角色信息',
    fields: [
      { name: 'post_type', type: '"message"', required: true, description: '事件主类型' },
      { name: 'message_type', type: '"group"', required: true, description: '群消息标识' },
      { name: 'group_id', type: 'number', required: true, description: '群号' },
      { name: 'group_name', type: 'string', required: false, description: '群名称' },
      { name: 'message_id', type: 'number', required: true, description: '本服务台账消息 ID，可用于引用、撤回、回应' },
      { name: 'message', type: 'MessageSegment[] | string', required: true, description: '消息段数组（或 messageFormat="string" 时的 CQ 码）' },
      { name: 'raw_message', type: 'string', required: true, description: '可读文本摘要（解析请始终以 message 字段为准）' },
      { name: 'sender', type: 'object', required: true, description: '含 user_id、uid、nickname、card、role (owner/admin/member)' },
    ],
    payload: {
      post_type: 'message',
      message_type: 'group',
      sub_type: 'normal',
      time: 1795689600,
      self_id: 10000,
      group_id: 100001,
      group_name: 'Panette 交流群',
      peer_uid: '100001',
      message_id: 1042,
      font: 14,
      message: [
        { type: 'at', data: { qq: '10000' } },
        { type: 'text', data: { text: ' 小面包在吗？' } },
      ],
      raw_message: '[CQ:at,qq=10000] 小面包在吗？',
      sender: { user_id: 10001, uid: 'u_demo_sender', nickname: '测试群友', card: '群名片', role: 'member' },
    },
  },
  {
    id: 'event_message_private',
    kind: 'event',
    method: 'EVENT',
    path: 'message.private',
    name: 'message.private',
    title: '私聊消息事件',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS (universal/event)', '反向 WS', 'HTTP 上报 (NT_REPORT_URL)'],
    discriminator: { post_type: 'message', message_type: 'private', sub_type: 'friend' },
    docId: 'api-messages',
    docAnchor: '接收消息',
    summary: '收到好友私聊消息时主动推送，顶层包含 user_id，sender 不带 role',
    fields: [
      { name: 'post_type', type: '"message"', required: true, description: '事件主类型' },
      { name: 'message_type', type: '"private"', required: true, description: '私聊消息标识' },
      { name: 'sub_type', type: '"friend"', required: true, description: '私聊子类型' },
      { name: 'user_id', type: 'number', required: true, description: '对方 QQ 号' },
      { name: 'message_id', type: 'number', required: true, description: '本服务台账消息 ID' },
      { name: 'message', type: 'MessageSegment[] | string', required: true, description: '消息段数组或 CQ 字符串' },
      { name: 'sender', type: 'object', required: true, description: '含 user_id、uid、nickname' },
    ],
    payload: {
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      time: 1795689605,
      self_id: 10000,
      user_id: 10001,
      peer_uid: 'u_demo_friend',
      message_id: 1043,
      font: 14,
      message: [{ type: 'text', data: { text: '你好！' } }],
      raw_message: '你好！',
      sender: { user_id: 10001, uid: 'u_demo_friend', nickname: '测试好友' },
    },
  },
  {
    id: 'event_message_sent',
    kind: 'event',
    method: 'EVENT',
    path: 'message_sent.self',
    name: 'message_sent.self',
    title: '自身发送消息上报',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS（需开启 reportSelfMessage: true）', '反向 WS（需开启 reportSelfMessage: true）'],
    discriminator: { post_type: 'message_sent', message_sent_type: 'self' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '本账号在任意端（手机/PC/API）发出消息时的回显上报，默认关闭',
    fields: [
      { name: 'post_type', type: '"message_sent"', required: true, description: '自身发送事件类型' },
      { name: 'message_sent_type', type: '"self"', required: true, description: '固定为 self' },
      { name: 'message_type', type: '"group" | "private"', required: true, description: '会话类型' },
      { name: 'target_id', type: 'number', required: false, description: '私聊时为对端 QQ 号' },
      { name: 'group_id', type: 'number', required: false, description: '群聊时为目标群号' },
      { name: 'message', type: 'MessageSegment[] | string', required: true, description: '发出的消息内容' },
    ],
    payload: {
      post_type: 'message_sent',
      message_sent_type: 'self',
      message_type: 'private',
      sub_type: 'friend',
      time: 1795689610,
      self_id: 10000,
      user_id: 10000,
      target_id: 10001,
      message_id: 1044,
      message: [{ type: 'text', data: { text: '已收到！' } }],
      raw_message: '已收到！',
    },
  },
  {
    id: 'event_notice_poke',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.notify.poke',
    name: 'notice.notify.poke',
    title: '戳一戳通知',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS', 'HTTP 上报'],
    discriminator: { post_type: 'notice', notice_type: 'notify', sub_type: 'poke' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '群聊或私聊触发戳一戳时主动推送',
    fields: [
      { name: 'post_type', type: '"notice"', required: true, description: '通知事件' },
      { name: 'notice_type', type: '"notify"', required: true, description: '系统提醒类通知' },
      { name: 'sub_type', type: '"poke"', required: true, description: '戳一戳子类型' },
      { name: 'user_id', type: 'number', required: true, description: '发起戳一戳者 QQ 号' },
      { name: 'target_id', type: 'number', required: true, description: '被戳者 QQ 号' },
      { name: 'group_id', type: 'number', required: false, description: '群内戳一戳时出现' },
      { name: 'raw_text', type: 'string', required: false, description: '戳一戳后缀文案（如有）' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      time: 1795689620,
      self_id: 10000,
      group_id: 100001,
      user_id: 10001,
      target_id: 10000,
      raw_text: '戳了戳 小面包2号 的耳朵',
    },
  },
  {
    id: 'event_notice_recall',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.recall',
    name: 'notice.group_recall / friend_recall',
    title: '消息撤回通知',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS', 'HTTP 上报'],
    discriminator: { post_type: 'notice', notice_type: 'group_recall | friend_recall' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '群消息或私聊消息被撤回时推送；注意 message_id 固定为 0',
    fields: [
      { name: 'notice_type', type: '"group_recall" | "friend_recall"', required: true, description: '群撤回或好友撤回' },
      { name: 'group_id', type: 'number', required: false, description: '群撤回时包含群号' },
      { name: 'user_id', type: 'number', required: true, description: '原消息发送者 QQ 号' },
      { name: 'operator_id', type: 'number', required: true, description: '执行撤回的操作者 QQ 号' },
      { name: 'message_id', type: '0', required: true, description: '固定为 0，请勿传给 get_msg' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'group_recall',
      time: 1795689630,
      self_id: 10000,
      group_id: 100001,
      user_id: 10001,
      operator_id: 10001,
      message_id: 0,
    },
  },
  {
    id: 'event_notice_gray_tip',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.notify.gray_tip',
    name: 'notice.notify.gray_tip',
    title: '私聊系统灰条提示',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS', 'HTTP 上报'],
    discriminator: { post_type: 'notice', notice_type: 'notify', sub_type: 'gray_tip' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '私聊会话出现系统灰条提示（非戳一戳）时推送原始元信息',
    fields: [
      { name: 'user_id', type: 'number', required: true, description: '会话对端 QQ 号' },
      { name: 'raw_tip', type: 'object', required: true, description: '含 element_types、msg_type、msg_sub_type、msg_id' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'gray_tip',
      time: 1795689640,
      self_id: 10000,
      user_id: 10001,
      raw_tip: { element_types: [8], msg_type: 5, msg_sub_type: 12, msg_id: '7391000001' },
    },
  },
  {
    id: 'event_voice_call_incoming',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.notify.voice_call_incoming',
    name: 'notice.voice_call_incoming',
    title: 'QQ 语音/视频来电通知',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'notice', notice_type: 'notify', sub_type: 'voice_call_incoming' },
    docId: 'api-calls',
    docAnchor: '通话事件',
    summary: '收到好友语音或视频通话邀请时实时推送，可据此调用 voice_call_accept 或 voice_call_reject',
    fields: [
      { name: 'sub_type', type: '"voice_call_incoming"', required: true, description: '来电事件标识' },
      { name: 'user_id', type: 'number', required: true, description: '主叫 QQ 号' },
      { name: 'from_uin', type: 'number', required: true, description: '主叫 UIN' },
      { name: 'peer_uid', type: 'string', required: true, description: '主叫 UID' },
      { name: 'room_id', type: 'string', required: true, description: '通话房间 ID（接听/拒接时原样传回）' },
      { name: 'is_video', type: 'boolean', required: true, description: 'true 为视频来电，false 为语音来电' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'voice_call_incoming',
      time: 1795689650,
      self_id: 10000,
      user_id: 10001,
      room_id: '1234567890123456',
      peer_uid: 'u_demo_caller',
      is_video: false,
      from_uin: 10001,
    },
  },
  {
    id: 'event_voice_call_connected',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.notify.voice_call_connected',
    name: 'notice.voice_call_connected',
    title: 'QQ 通话已接通通知',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'notice', notice_type: 'notify', sub_type: 'voice_call_connected' },
    docId: 'api-calls',
    docAnchor: '通话事件',
    summary: '双方媒体链路接通后推送，此时可安全播放音频或外部视频源',
    fields: [
      { name: 'sub_type', type: '"voice_call_connected"', required: true, description: '接通事件标识' },
      { name: 'user_id', type: 'number', required: true, description: '对端 QQ 号' },
      { name: 'room_id', type: 'string', required: true, description: '通话房间 ID' },
      { name: 'direction', type: '"incoming" | "outgoing"', required: true, description: '呼入或呼出方向' },
      { name: 'is_video', type: 'boolean', required: true, description: '是否包含视频' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'voice_call_connected',
      time: 1795689654,
      self_id: 10000,
      user_id: 10001,
      room_id: '1234567890123456',
      direction: 'incoming',
      is_video: false,
    },
  },
  {
    id: 'event_voice_call_ended',
    kind: 'event',
    method: 'EVENT',
    path: 'notice.notify.voice_call_ended',
    name: 'notice.voice_call_ended',
    title: 'QQ 通话结束通知',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'notice', notice_type: 'notify', sub_type: 'voice_call_ended' },
    docId: 'api-calls',
    docAnchor: '通话事件',
    summary: '通话挂断、拒接或超时结束时推送，附带通话时长与音频包统计',
    fields: [
      { name: 'sub_type', type: '"voice_call_ended"', required: true, description: '通话结束事件标识' },
      { name: 'room_id', type: 'string', required: true, description: '通话房间 ID' },
      { name: 'reason', type: 'string', required: true, description: '结束原因原文（请原样保留）' },
      { name: 'duration_ms', type: 'number', required: true, description: '通话总持续毫秒数' },
      { name: 'stats', type: 'object', required: true, description: '收发音频包与 PCM 字节统计' },
    ],
    payload: {
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'voice_call_ended',
      time: 1795689710,
      self_id: 10000,
      user_id: 10001,
      room_id: '1234567890123456',
      direction: 'incoming',
      is_video: false,
      reason: 'peer_hangup',
      duration_ms: 56000,
      stats: { audioPkts: 2740, sentVoiceFrames: 920, pcmBytes: 1753600 },
    },
  },
  {
    id: 'event_meta_lifecycle',
    kind: 'event',
    method: 'EVENT',
    path: 'meta_event.lifecycle',
    name: 'meta_event.lifecycle',
    title: '连接生命周期元事件',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'meta_event', meta_event_type: 'lifecycle' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: 'WebSocket 握手建立（connect）或服务启用（enable）时立即推送',
    fields: [
      { name: 'post_type', type: '"meta_event"', required: true, description: '元事件类型' },
      { name: 'meta_event_type', type: '"lifecycle"', required: true, description: '生命周期事件' },
      { name: 'sub_type', type: '"connect" | "enable"', required: true, description: '子类型' },
      { name: 'self_id', type: 'number', required: true, description: '当前机器人 QQ 号' },
      { name: 'time', type: 'number', required: true, description: '秒级时间戳' },
    ],
    payload: {
      post_type: 'meta_event',
      meta_event_type: 'lifecycle',
      sub_type: 'connect',
      time: 1795689600,
      self_id: 10000,
    },
  },
  {
    id: 'event_meta_heartbeat',
    kind: 'event',
    method: 'EVENT',
    path: 'meta_event.heartbeat',
    name: 'meta_event.heartbeat',
    title: '服务心跳元事件',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'meta_event', meta_event_type: 'heartbeat' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '默认每 10 秒推送一次状态心跳（heartbeatMs: 0 可关闭周期推送，但状态变化仍触发）',
    fields: [
      { name: 'meta_event_type', type: '"heartbeat"', required: true, description: '心跳元事件' },
      { name: 'interval', type: 'number', required: false, description: '心跳周期（毫秒）' },
      { name: 'status', type: '{ online: boolean, good: boolean }', required: true, description: '账号在线与服务健康状态' },
    ],
    payload: {
      post_type: 'meta_event',
      meta_event_type: 'heartbeat',
      time: 1795689610,
      self_id: 10000,
      interval: 10000,
      status: { online: true, good: true },
    },
  },
  {
    id: 'event_meta_recent_contacts',
    kind: 'event',
    method: 'EVENT',
    path: 'meta_event.recent_contacts',
    name: 'meta_event.recent_contacts',
    title: '最近会话变更（扩展）',
    category: '事件上报（WS / HTTP Push）',
    channels: ['正向 WS', '反向 WS'],
    discriminator: { post_type: 'meta_event', meta_event_type: 'recent_contacts' },
    docId: 'api-onebot',
    docAnchor: '事件目录',
    summary: '扩展元事件：推送原始最近会话列表更新（不带统一 time/self_id 顶层字段）',
    fields: [
      { name: 'post_type', type: '"meta_event"', required: true, description: '元事件类型' },
      { name: 'meta_event_type', type: '"recent_contacts"', required: true, description: '最近会话变更' },
      { name: 'data', type: 'unknown', required: true, description: '原始最近会话更新载荷' },
    ],
    payload: {
      post_type: 'meta_event',
      meta_event_type: 'recent_contacts',
      data: [{ peer_uid: '100001', chat_type: 2, unread_cnt: 1 }],
    },
  },
];

// ---------------------------------------------------------------------------
// 6. Message Segments & Retcodes (for Schema Explorer)
// ---------------------------------------------------------------------------
const SEGMENTS = {
  receive: [
    { type: 'text', fields: 'text: string', desc: '纯文本内容', example: { type: 'text', data: { text: '你好世界' } }, cq: '你好世界' },
    { type: 'at', fields: 'qq: string（全体为 "all"）', desc: '提及群成员或全体成员', example: { type: 'at', data: { qq: '10001' } }, cq: '[CQ:at,qq=10001]' },
    { type: 'image', fields: 'file；可选 file_name, file_size, width, height, file_hash, path, url（商城表情另带 emoji_id, summary）', desc: '图片或商城动态表情（入站自动支持实时 rkey 惰性补签）', example: { type: 'image', data: { file: 'demo.jpg', url: 'https://multimedia.nt.qq.com.cn/...&rkey=...', width: 1280, height: 720 } }, cq: '[CQ:image,file=demo.jpg,url=https://...]' },
    { type: 'face', fields: 'id: string；可选 raw（表情文字）', desc: 'QQ 标准系统小黄脸表情', example: { type: 'face', data: { id: '76', raw: '/赞' } }, cq: '[CQ:face,id=76]' },
    { type: 'reply', fields: 'id: string；可选 sender_uin, sender_uid, text', desc: '引用回复某条历史消息', example: { type: 'reply', data: { id: '1040', text: '原消息预览' } }, cq: '[CQ:reply,id=1040]' },
    { type: 'record', fields: 'file；可选 duration, file_size, file_id, file_hash, path', desc: '语音消息（配合 get_media_url 获取直链）', example: { type: 'record', data: { file: 'voice.amr', duration: 6, file_id: 'EhR...' } }, cq: '[CQ:record,file=voice.amr]' },
    { type: 'video', fields: 'file；可选 duration, file_size, file_id, file_hash, store_id, thumb, path', desc: '短视频消息', example: { type: 'video', data: { file: 'clip.mp4', duration: 12, file_id: 'EhV...' } }, cq: '[CQ:video,file=clip.mp4]' },
    { type: 'file', fields: 'file；可选 file_size, file_id, path', desc: '私聊或群文件消息', example: { type: 'file', data: { file: 'report.pdf', file_size: 245760 } }, cq: '[CQ:file,file=report.pdf]' },
    { type: 'forward', fields: 'id；可选 summary, source, file_name, xml', desc: '合并转发卡片（传 message_id 给 get_forward_msg 展开）', example: { type: 'forward', data: { id: 'res_id_xxx', summary: '查看 3 条转发消息' } }, cq: '[CQ:forward,id=res_id_xxx]' },
    { type: 'json', fields: 'data: string', desc: 'Ark / JSON 小程序或分享卡片原文', example: { type: 'json', data: { data: '{"app":"com.tencent.structmsg","view":"news"}' } }, cq: '[CQ:json,data=...]' },
    { type: 'markdown', fields: 'content: string', desc: 'Markdown 富文本消息段', example: { type: 'markdown', data: { content: '**Panette** 已就绪' } }, cq: '[markdown]' },
    { type: 'redbag', fields: 'title, sub_title, bill_no, grab_state；可选 red_type', desc: '红包消息提示段', example: { type: 'redbag', data: { title: '恭喜发财', bill_no: '1000039901...', grab_state: 0 } }, cq: '[redbag]' },
  ],
  send: [
    { type: 'text', fields: 'text: string', desc: '原样纯文本，适合包含字面 [CQ:...] 内容', example: { type: 'text', data: { text: '你好，小面包！' } }, cq: '你好，小面包！' },
    { type: 'at', fields: 'qq: string（别名 user_id，全体为 "all"）', desc: '提及成员或全体成员', example: { type: 'at', data: { qq: '10001' } }, cq: '[CQ:at,qq=10001]' },
    { type: 'reply', fields: 'id（别名 message_id）', desc: '引用回复（自动移至首位，仅取第一条有效 reply）', example: { type: 'reply', data: { id: '1042' } }, cq: '[CQ:reply,id=1042]' },
    { type: 'image', fields: 'file: string', desc: '服务端本地路径或 file:// URL（远程图先用 download_file）', example: { type: 'image', data: { file: '/data/banner.png' } }, cq: '[CQ:image,file=/data/banner.png]' },
    { type: 'video', fields: 'file: string', desc: '本地视频路径（Linux 预览生成需 ffmpeg）', example: { type: 'video', data: { file: '/data/demo.mp4' } }, cq: '请使用段数组发送' },
    { type: 'file', fields: 'file: string', desc: '发送本地文件（私聊文件同样使用此段）', example: { type: 'file', data: { file: '/data/guide.pdf' } }, cq: '请使用段数组发送' },
    { type: 'json', fields: 'data: string | object', desc: '已签名 Ark / JSON 卡片（可配合 get_mini_app_ark / ark_share_*）', example: { type: 'json', data: { data: '{"app":"com.tencent.structmsg","view":"news","prompt":"[分享]"}' } }, cq: '[CQ:json,data=...]' },
    { type: 'contact', fields: 'type: "qq" | "group", id: string | number', desc: '推荐好友或推荐群名片，发送前自动签名', example: { type: 'contact', data: { type: 'group', id: '100001' } }, cq: '请使用段数组发送' },
    { type: 'music', fields: 'type, id；或 type:"custom", url, audio, title, content?, image?', desc: '音乐分享卡片（通过 musicSignUrl 签发 Ark JSON）', example: { type: 'music', data: { type: 'custom', url: 'https://example.com/song', audio: 'https://example.com/song.mp3', title: '示例歌曲', content: '示例歌手' } }, cq: '请使用段数组发送' },
  ],
};

const RETCODES = [
  { code: 0, status: 'ok', meaning: '成功；批量操作另检查 data.failed，文件操作留意 move_error 等逐项结果' },
  { code: 102, status: 'failed', meaning: 'QQ 离线；恢复登录后再调用' },
  { code: 401, status: 'failed', meaning: 'HTTP 鉴权失败；核对 Authorization Bearer Token' },
  { code: 403, status: 'failed', meaning: '该端口未启用 HTTP 动作服务' },
  { code: 404, status: 'failed', meaning: '动作名未知或已在 Release 构建中裁剪' },
  { code: 500, status: 'failed', meaning: '参数错误、群权限不足或底层协议执行失败（详情见 message）' },
  { code: 1200, status: 'failed', meaning: '正向 WS 单连接并发动作数超过上限 32' },
  { code: 1403, status: 'failed', meaning: '在 event 角色 WS 连接上尝试调用动作' },
  { code: 1404, status: 'failed', meaning: '正向 WS 请求体缺少 action 字段' },
];

// ---------------------------------------------------------------------------
// 7. Build Apifox-ready OpenAPI 3.1.0 Spec
// ---------------------------------------------------------------------------
function toJsonSchemaType(typeStr) {
  if (/boolean/.test(typeStr)) return { type: 'boolean' };
  if (/^number/.test(typeStr)) return { type: 'number' };
  if (/\[\]/.test(typeStr) || /^Array/.test(typeStr)) return { type: 'array', items: {} };
  if (/object/.test(typeStr)) return { type: 'object' };
  return { type: 'string' };
}

function buildOpenApiSpec(version, actions, directEndpoints, pushEvents) {
  const paths = {};

  // Direct HTTP endpoints
  for (const ep of directEndpoints) {
    const method = ep.method.toLowerCase();
    paths[ep.path] = {
      [method]: {
        tags: [ep.category],
        operationId: ep.id,
        summary: ep.summary,
        description: `${ep.notes}\n\n鉴权：${ep.auth}`,
        security: ep.path === '/healthz' ? [] : [{ bearerAuth: [] }],
        parameters: ep.params.map((p) => ({
          name: p.name,
          in: 'query',
          required: p.required,
          description: p.description,
          schema: toJsonSchemaType(p.type),
        })),
        responses: {
          '200': {
            description: ep.returns,
            content:
              typeof ep.mockResponse === 'string'
                ? { 'text/plain': { example: ep.mockResponse } }
                : { 'application/json': { example: ep.mockResponse } },
          },
        },
      },
    };
  }

  // OneBot POST /{action} endpoints
  for (const act of actions) {
    const props = {};
    const required = [];
    for (const p of act.params) {
      props[p.name] = {
        ...toJsonSchemaType(p.type),
        description: [p.description, p.aliases.length ? `别名: ${p.aliases.join(', ')}` : ''].filter(Boolean).join('；'),
        ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
      };
      if (p.required) required.push(p.name);
    }

    paths[`/${act.name}`] = {
      post: {
        tags: [act.category],
        operationId: act.name,
        summary: act.summary,
        description: [
          act.aliases.length ? `动作别名：${act.aliases.map((a) => `\`${a}\``).join('、')}` : '',
          `返回 data：${act.returns}`,
          act.notes || '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        requestBody: {
          required: required.length > 0,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: props,
                ...(required.length ? { required } : {}),
              },
              example: act.exampleBody,
            },
          },
        },
        responses: {
          '200': {
            description: `OneBot v11 响应外层（data: ${act.returns}）`,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OneBotResponse' },
                example: act.mockResponse,
              },
            },
          },
        },
      },
    };
  }

  // OpenAPI 3.1 native webhooks for proactive push events (Apifox natively imports these!)
  const webhooks = {};
  for (const ev of pushEvents) {
    const props = {};
    for (const f of ev.fields) {
      props[f.name] = { ...toJsonSchemaType(f.type), description: f.description };
    }
    webhooks[ev.id] = {
      post: {
        tags: [ev.category],
        operationId: ev.id,
        summary: `${ev.title} (${ev.name})`,
        description: `${ev.summary}\n\n推送通道：${ev.channels.join(' / ')}`,
        requestBody: {
          description: '服务端主动推送事件体（WebSocket 帧或 HTTP POST Body）',
          content: {
            'application/json': {
              schema: { type: 'object', properties: props },
              example: ev.payload,
            },
          },
        },
        responses: {
          '200': { description: '接收端确认收到事件' },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Panette OneBot v11 API',
      version,
      summary: 'QQ NT OneBot v11 协议端公开接口、直连运维端点与事件上报（Webhooks）规范',
      description:
        '可直接导入 Apifox / Postman / Insomnia。包含全部公开 OneBot v11 动作（POST /{action}）、运维与媒体直连端点（/healthz, /metrics, /voice/*），以及 OpenAPI 3.1 原生 webhooks 主动上报事件模型。',
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://127.0.0.1:3001', description: '本地默认 OneBot HTTP 服务' },
    ],
    security: [{ bearerAuth: [] }],
    paths,
    webhooks,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: '在 Panette WebUI「网络配置」中设置的 OneBot Token',
        },
      },
      schemas: {
        OneBotResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'failed'] },
            retcode: { type: 'integer', description: '0 表示成功，非 0 为错误码' },
            data: { description: '接口返回载荷，写操作通常为 null' },
            message: { type: 'string', description: '失败时的可读错误原因' },
            echo: { description: 'WebSocket 请求原样回显字段（HTTP 响应不含此字段）' },
          },
          required: ['status', 'retcode', 'data'],
        },
        MessageSegment: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['text', 'at', 'reply', 'image', 'face', 'record', 'video', 'file', 'forward', 'json', 'contact', 'music', 'markdown', 'redbag'] },
            data: { type: 'object', additionalProperties: true },
          },
          required: ['type', 'data'],
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(path.join(REPO_ROOT, 'server/package.json'))) {
    throw new Error(`Panette repo not found at ${REPO_ROOT}. Set PANETTE_REPO env var.`);
  }

  syncAssets();

  const serverPkg = JSON.parse(readText('server/package.json'));
  const excludeCfg = JSON.parse(readText('server/release-exclude-actions.json'));
  const excludedSet = new Set(excludeCfg.exclude || []);

  // Compile public markdown docs
  const docs = DOC_DEFS.map((def) => {
    const raw = readText(def.file);
    const rendered = renderMarkdown(raw, def.file);
    return {
      id: def.id,
      group: def.group,
      title: def.title,
      shortTitle: def.shortTitle,
      sourceFile: def.file,
      toc: rendered.toc,
      html: rendered.html,
      excerpt: rendered.excerpt,
      searchText: rendered.searchText,
    };
  });

  // Parse public actions (excluding release-pruned internal actions)
  const actions = [
    ...parseActionsFromDoc('docs/api/onebot.md', 'api-onebot', excludedSet),
    ...parseActionsFromDoc('docs/api/messages.md', 'api-messages', excludedSet),
    ...parseActionsFromDoc('docs/api/calls.md', 'api-calls', excludedSet),
  ];

  // Deduplicate by action name while preserving order
  const seen = new Set();
  const uniqueActions = [];
  for (const a of actions) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    uniqueActions.push(a);
  }

  const openapi = buildOpenApiSpec(serverPkg.version, uniqueActions, DIRECT_ENDPOINTS, PUSH_EVENTS);

  ensureDir(path.join(SITE_ROOT, 'src/generated'));
  ensureDir(path.join(SITE_ROOT, 'public'));

  fs.writeFileSync(
    path.join(SITE_ROOT, 'public/openapi.json'),
    JSON.stringify(openapi, null, 2) + '\n',
    'utf8',
  );

  const siteData = {
    version: serverPkg.version,
    syncedAt: new Date().toISOString(),
    stats: {
      docCount: docs.length,
      actionCount: uniqueActions.length,
      aliasCount: uniqueActions.reduce((acc, a) => acc + a.aliases.length, 0),
      directEndpointCount: DIRECT_ENDPOINTS.length,
      eventCount: PUSH_EVENTS.length,
      excludedCount: excludedSet.size,
    },
    docs,
    actions: uniqueActions,
    directEndpoints: DIRECT_ENDPOINTS,
    pushEvents: PUSH_EVENTS,
    segments: SEGMENTS,
    retcodes: RETCODES,
  };

  fs.writeFileSync(
    path.join(SITE_ROOT, 'src/generated/site-data.json'),
    JSON.stringify(siteData) + '\n',
    'utf8',
  );

  console.log(
    `Synced Panette v${serverPkg.version}: ${docs.length} docs, ${uniqueActions.length} public actions (+${siteData.stats.aliasCount} aliases, ${excludedSet.size} internal pruned), ${DIRECT_ENDPOINTS.length} direct HTTP endpoints, ${PUSH_EVENTS.length} push events -> public/openapi.json & src/generated/site-data.json`,
  );
}

main();

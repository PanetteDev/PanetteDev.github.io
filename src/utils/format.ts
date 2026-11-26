import type { StudioEntry } from '../types.ts';

export function esc(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function highlightJson(input: unknown): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const safe = esc(raw);
  return safe.replace(
    /(&quot;(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&]|&(?!quot;))*&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (match.startsWith('&quot;')) {
        if (match.endsWith(':')) {
          return `<span class="jk">${match.slice(0, -1)}</span>:`;
        }
        return `<span class="js">${match}</span>`;
      }
      if (match === 'true' || match === 'false') return `<span class="jb">${match}</span>`;
      if (match === 'null') return `<span class="jl">${match}</span>`;
      return `<span class="jn">${match}</span>`;
    },
  );
}

let toastTimer: number | null = null;
export function showToast(msg: string, kind: 'ok' | 'err' | 'info' = 'ok'): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast-item toast-${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const remove = () => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 220);
  };
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(remove, 2400);
}

export async function copyToClipboard(text: string, label = '已复制到剪贴板'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label, 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(label, 'ok');
  }
}

export type CodeLang = 'curl' | 'powershell' | 'javascript' | 'python' | 'websocket';

export function generateCodeSnippet(
  entry: StudioEntry,
  lang: CodeLang,
  opts: { baseUrl: string; wsUrl: string; token: string; bodyText: string },
): string {
  const base = (opts.baseUrl || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  const wsUrl = opts.wsUrl || 'ws://127.0.0.1:3001/ws';
  const tok = opts.token.trim() || '$PANETTE_TOKEN';
  const hasRealToken = Boolean(opts.token.trim());
  const bearerHeader = hasRealToken ? `Bearer ${tok}` : 'Bearer $PANETTE_TOKEN';

  let parsedBody: unknown = {};
  try {
    parsedBody = opts.bodyText.trim() ? JSON.parse(opts.bodyText) : {};
  } catch {
    parsedBody = {};
  }
  const compactBody = JSON.stringify(parsedBody);
  const prettyBody = JSON.stringify(parsedBody, null, 2);

  if (entry.kind === 'event') {
    const filterExpr = Object.entries(entry.discriminator)
      .map(([k, v]) => `ev.${k} === ${JSON.stringify(v.split(' | ')[0])}`)
      .join(' && ');
    const pyFilter = Object.entries(entry.discriminator)
      .map(([k, v]) => `ev.get(${JSON.stringify(k)}) == ${JSON.stringify(v.split(' | ')[0])}`)
      .join(' and ');

    if (lang === 'websocket') {
      return `// 服务端主动推送帧（无需客户端先发动作）\n// 连接：${wsUrl}?role=event\n${JSON.stringify(entry.payload, null, 2)}`;
    }
    if (lang === 'javascript') {
      return `import WebSocket from 'ws';

const ws = new WebSocket('${wsUrl}?role=event', {
  headers: { Authorization: '${bearerHeader}' },
});

ws.on('message', (raw) => {
  const ev = JSON.parse(raw.toString());
  if (${filterExpr}) {
    console.log('[${entry.name}]', ev);
  }
});`;
    }
    if (lang === 'python') {
      return `import asyncio, json, websockets

async def listen():
    headers = {"Authorization": "${bearerHeader}"}
    async with websockets.connect("${wsUrl}?role=event", additional_headers=headers) as ws:
        async for raw in ws:
            ev = json.loads(raw)
            if ${pyFilter}:
                print("[${entry.name}]", ev)

asyncio.run(listen())`;
    }
    if (lang === 'powershell') {
      return `# 开启 HTTP 事件上报（重启 Panette 生效）：
$env:NT_REPORT_URL = "http://127.0.0.1:8080/onebot/events"

# 示例：事件推送 JSON 载荷
@'
${JSON.stringify(entry.payload, null, 2)}
'@`;
    }
    return `# 方式一：通过正向 WebSocket 订阅（推荐，覆盖全部事件）
# 连接地址：${wsUrl}?role=event
# 请求头：Authorization: ${bearerHeader}

# 方式二：开启 HTTP 上报（仅消息与消息流通知）
export NT_REPORT_URL="http://127.0.0.1:8080/onebot/events"`;
  }

  if (entry.kind === 'http') {
    const url = `${base}${entry.path}`;
    const needsAuth = entry.path !== '/healthz';
    if (lang === 'curl') {
      if (entry.path === '/voice/say') {
        return `curl -X POST '${url}?clear=1' \\\n  -H "Authorization: ${bearerHeader}" \\\n  -H 'Content-Type: audio/wav' \\\n  --data-binary @hello.wav`;
      }
      return `curl '${url}'${needsAuth ? ` \\\n  -H "Authorization: ${bearerHeader}"` : ''}`;
    }
    if (lang === 'powershell') {
      return `${needsAuth ? `$headers = @{ Authorization = "${bearerHeader}" }\n` : ''}Invoke-RestMethod -Method ${entry.method} -Uri '${url}'${needsAuth ? ' -Headers $headers' : ''}`;
    }
    if (lang === 'javascript') {
      return `const res = await fetch('${url}', {
  method: '${entry.method}',${needsAuth ? `\n  headers: { Authorization: '${bearerHeader}' },` : ''}
});
console.log(res.status, await res.text());`;
    }
    if (lang === 'python') {
      return `import requests

res = requests.${entry.method.toLowerCase()}(
    "${url}",${needsAuth ? `\n    headers={"Authorization": "${bearerHeader}"},` : ''}
)
print(res.status_code, res.text[:400])`;
    }
    return `// 该端点为原生 HTTP 路由（${entry.method} ${entry.path}），不使用 WebSocket 动作封装。`;
  }

  // Standard OneBot Action
  const url = `${base}/${entry.name}`;
  if (lang === 'websocket') {
    return JSON.stringify(
      {
        action: entry.name,
        params: parsedBody,
        echo: `${entry.name}-1`,
      },
      null,
      2,
    );
  }
  if (lang === 'curl') {
    return `curl -X POST '${url}' \\\n  -H "Authorization: ${bearerHeader}" \\\n  -H 'Content-Type: application/json' \\\n  --data '${compactBody.replace(/'/g, "'\\''")}'`;
  }
  if (lang === 'powershell') {
    return `$headers = @{ Authorization = "${bearerHeader}" }
$body = @'
${prettyBody}
'@
Invoke-RestMethod -Method Post -Uri '${url}' \`
  -Headers $headers -ContentType 'application/json' -Body $body`;
  }
  if (lang === 'javascript') {
    return `const res = await fetch('${url}', {
  method: 'POST',
  headers: {
    'Authorization': '${bearerHeader}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${prettyBody.replace(/\n/g, '\n  ')}),
});
const data = await res.json();
console.log(data);`;
  }
  return `import requests

res = requests.post(
    "${url}",
    headers={"Authorization": "${bearerHeader}"},
    json=${prettyBody.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None').replace(/\n/g, '\n    ')},
    timeout=15,
)
print(res.json())`;
}

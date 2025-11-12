export const runtime = 'edge';
import { NextRequest } from 'next/server';

const DEFAULT_DOH = 'cloudflare-dns.com';
const dohHost = (process.env.DOH || DEFAULT_DOH).replace(/^https?:\/\//,'').split('/')[0];
const jsonDoH = `https://${dohHost}/resolve`;

function cors(h: Headers = new Headers()){h.set('access-control-allow-origin','*');h.set('access-control-allow-methods','GET, POST, OPTIONS');h.set('access-control-allow-headers','*');return h;}

export async function GET(req: NextRequest){
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/') {
    const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HongShi-DoH</title><link rel="icon" href="/favicon.png">
<style>body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:linear-gradient(135deg,#ff8a00,#ff5e62);min-height:100vh;display:grid;place-items:center}
.card{width:920px;max-width:92vw;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.35);border-radius:18px;box-shadow:0 24px 80px rgba(255,94,98,.25);padding:24px;margin:40px 0}
header{display:flex;align-items:center;gap:14px;margin-bottom:8px}
.avatar{width:48px;height:48px;border-radius:14px;border:1px solid rgba(0,0,0,.05);object-fit:cover}
h1{margin:0;font-size:28px}.muted{color:#445}.row{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
a.btn{display:inline-block;background:#ff6a3d;color:#fff;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:800}
a.btn.alt{background:#eef3ff;color:#1a2b6c;border:1px solid #d9e4ff}
code{background:#fff5f2;border:1px solid #ffd8cf;border-radius:8px;padding:2px 6px}</style>
</head><body><div class="card">
<header><img src="/favicon.png" class="avatar" alt="avatar"><div><h1>HongShi-DoH</h1><div class="muted">安全模式：根路径不提供 DoH，仅作导航与状态展示</div></div></header>
<p class="muted">当前站点端点： <code id="ep">检测中…</code> <span id="hint" class="muted"></span></p>
<div class="row">
  <a class="btn" href="/ui/">打开查询 UI</a>
  <a class="btn alt" href="/ip" target="_blank" rel="noreferrer">查看 IP 与归属地</a>
  <a class="btn alt" href="/host" target="_blank" rel="noreferrer">查看主机/平台信息</a>
  <a class="btn alt" href="/resolve?name=example.com&type=A" target="_blank" rel="noreferrer">试试 /resolve</a>
</div>
<p class="muted" style="margin-top:14px">若 <code>DOH_PATH</code> ≠ <code>dns-query</code>，仅 <code>/%DOH_PATH%</code> 可用，<code>/dns-query</code> 将 404。</p>
</div>
<script>(async()=>{try{const r=await fetch('/meta');if(!r.ok)throw 0;const j=await r.json();const ep=document.getElementById('ep');const hint=document.getElementById('hint');const p=j?.dohPath||'dns-query';ep.textContent=location.origin+'/'+p;hint.textContent=(j?.dnsQueryEnabled===false)?'（已禁用 /dns-query）':'（/dns-query 可用）';}catch{document.getElementById('ep').textContent='未知（/meta 获取失败）';}})();</script>
</body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  if (path === '/meta') {
    const dohPath = process.env.DOH_PATH || process.env.HSD_PATH || process.env.TOKEN || 'dns-query';
    const dnsQueryEnabled = dohPath === 'dns-query';
    return new Response(JSON.stringify({ dohPath, dnsQueryEnabled }, null, 2), { headers: cors(new Headers({'content-type':'application/json'}))});
  }

  if (path === '/ip') {
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const geo = {
      country: req.headers.get('x-vercel-ip-country') || undefined,
      region: req.headers.get('x-vercel-ip-country-region') || undefined,
      city: req.headers.get('x-vercel-ip-city') || undefined,
      latitude: req.headers.get('x-vercel-ip-latitude') || undefined,
      longitude: req.headers.get('x-vercel-ip-longitude') || undefined,
      timezone: req.headers.get('x-vercel-ip-timezone') || undefined,
    };
    return new Response(JSON.stringify({ ip, ...geo }, null, 2), { headers: cors(new Headers({ 'content-type': 'application/json' })) });
  }

  if (path === '/host') {
    const hostname = process.env.HOSTNAME || undefined;
    const region = process.env.VERCEL_REGION || undefined;
    const vercelUrl = process.env.VERCEL_URL || undefined;
    return new Response(JSON.stringify({ platform: 'vercel', hostname, region, url: vercelUrl }, null, 2), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  }

  if (path === '/resolve') {
    const name=url.searchParams.get('name'); const type=url.searchParams.get('type')||'A'; const doh=url.searchParams.get('doh')||'';
    if(!name) return new Response(JSON.stringify({error:'name required'}),{status:400,headers:{'content-type':'application/json'}});
    let target=doh || (process.env.DOH ? `https://${process.env.DOH.replace(/^https?:\/\//,'').split('/')[0]}` : 'https://cloudflare-dns.com');
    const u=new URL(target); const isGoogle=u.hostname.toLowerCase().includes('dns.google'); u.pathname=isGoogle?'/resolve':'/dns-query'; if(!isGoogle) u.searchParams.set('ct','application/dns-json');
    u.searchParams.set('name',name); u.searchParams.set('type',type);
    const r=await fetch(u.toString(),{headers:{'accept':'application/dns-json','user-agent':'HongShi-DoH/edge'}}); const txt=await r.text();
    return new Response(txt,{status:r.ok?200:502,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}});
  }

  if (path === '/ui') return new Response('', { status: 302, headers: { Location: '/ui/' } });

  return new Response('Not Found', { status: 404, headers: cors() });
}

export async function POST(){ return new Response('Not Found', { status: 404, headers: cors() }); }
export async function OPTIONS(){ return new Response(null,{status:204,headers:cors()}); }

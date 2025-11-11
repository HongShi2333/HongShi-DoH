export const runtime = 'edge';
import { NextRequest } from 'next/server';
const DEFAULT_DOH = 'cloudflare-dns.com';
const dohHost = (process.env.DOH || DEFAULT_DOH).replace(/^https?:\/\//,'').split('/')[0];
const jsonDoH = `https://${dohHost}/resolve`;
const dnsDoH  = `https://${dohHost}/dns-query`;
function cors(h: Headers = new Headers()){h.set('access-control-allow-origin','*');h.set('access-control-allow-methods','GET, POST, OPTIONS');h.set('access-control-allow-headers','*');return h;}
async function handleDoH(req: Request): Promise<Response>{
  const url=new URL(req.url);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  if(url.searchParams.has('name')){ const r=await fetch(jsonDoH+url.search,{headers:{'accept':'application/dns-json','user-agent':'HongShi-DoH/edge'}}); const txt=await r.text(); return new Response(txt,{status:r.ok?200:502,headers:cors(new Headers({'content-type':'application/json'}))}); }
  const isGetDns=url.searchParams.has('dns'); const isPost=req.method==='POST' && (req.headers.get('content-type')||'').startsWith('application/dns-message');
  if(!isGetDns && !isPost) return new Response('',{status:302,headers:{Location:'/ui'}});
  const upstream=isGetDns?dnsDoH+url.search:dnsDoH;
  const init: RequestInit = isGetDns ? { headers: { 'accept':'application/dns-message','user-agent':'HongShi-DoH/edge' } } : { method:'POST', headers:{'accept':'application/dns-message','content-type':'application/dns-message','user-agent':'HongShi-DoH/edge'}, body: await (req as any).arrayBuffer() };
  const r=await fetch(upstream,init); return new Response(r.body,{status:r.status,headers:cors(new Headers({'content-type':'application/dns-message'}))});
}
export async function GET(req: NextRequest){ return handleDoH(req); }
export async function POST(req: NextRequest){ return handleDoH(req); }

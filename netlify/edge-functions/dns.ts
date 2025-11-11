// HongShi-DoH Netlify Edge function
const DEFAULT_DOH = 'cloudflare-dns.com';

function getEnv() {
  return {
    DOH: Deno.env.get('DOH') ?? '',
    PATH: Deno.env.get('PATH') ?? Deno.env.get('TOKEN') ?? 'dns-query',
  };
}

function dohHost(env) {
  const base = (env.DOH || DEFAULT_DOH).replace(/^https?:\/\//, '');
  return base.split('/')[0];
}

const jsonDoH = (env) => `https://${dohHost(env)}/resolve`;
const dnsDoH  = (env) => `https://${dohHost(env)}/dns-query`;

function cors(h=new Headers()) {
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', '*');
  return h;
}

async function queryDns(dohUrl, domain, type) {
  const u = new URL(dohUrl);
  if (u.pathname.endsWith('/dns-query')) u.pathname = u.pathname.replace('/dns-query','/resolve');
  u.searchParams.set('name', domain);
  u.searchParams.set('type', type);

  const r = await fetch(u.toString(), { headers: { 'Accept': 'application/dns-json' }});
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  if (!r.ok) throw new Error(`Upstream ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { error: 'parse error', raw: text }; }
}

async function handleLocalDoh(domain, type, env) {
  if (type === 'all') {
    const [v4,v6,ns] = await Promise.all([
      queryDns(dnsDoH(env), domain, 'A'),
      queryDns(dnsDoH(env), domain, 'AAAA'),
      queryDns(dnsDoH(env), domain, 'NS'),
    ]);
    const nsRecords = [];
    (ns.Answer||[]).forEach(r=>{ if (r.type===2) nsRecords.push(r); });
    (ns.Authority||[]).forEach(r=>{ if (r.type===2||r.type===6) nsRecords.push(r); });
    return {
      Status: v4.Status||v6.Status||ns.Status,
      Question: [].concat(v4.Question||[], v6.Question||[], ns.Question||[]),
      Answer: [].concat(v4.Answer||[], v6.Answer||[], nsRecords)
    };
  } else {
    return await queryDns(dnsDoH(env), domain, type);
  }
}

async function handleResolve(request, env) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  const type = url.searchParams.get('type') || 'A';
  const doh  = url.searchParams.get('doh') || '';
  if (!name) return new Response(JSON.stringify({error:'name required'}), {status:400, headers: cors(new Headers({'content-type':'application/json'}))});

  let data;
  if (!doh || doh.startsWith(request.headers.get('x-forwarded-proto') + '://' + request.headers.get('host'))) {
    data = await handleLocalDoh(name, type, env);
  } else {
    data = await queryDns(doh, name, type);
  }
  return new Response(JSON.stringify(data, null, 2), {headers: cors(new Headers({'content-type':'application/json','cache-control':'no-store'}))});
}

async function handleDoH(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors()});
  if (url.searchParams.has('name')) {
    const r = await fetch(jsonDoH(env) + url.search, { headers: { 'accept':'application/dns-json' }});
    const txt = await r.text();
    return new Response(txt, { status: r.status, headers: cors(new Headers({'content-type':'application/json'}))});
  }
  const isGetDns = url.searchParams.has('dns');
  const isPost = request.method==='POST' && (request.headers.get('content-type')||'').startsWith('application/dns-message');
  if (!isGetDns && !isPost) return new Response('Bad Request', {status:400, headers:cors()});
  const upstream = isGetDns ? dnsDoH(env) + url.search : dnsDoH(env);
  const init = isGetDns ? { headers: { 'accept':'application/dns-message' } } : {
    method:'POST',
    headers: { 'accept':'application/dns-message', 'content-type':'application/dns-message' },
    body: await request.arrayBuffer()
  };
  const r = await fetch(upstream, init);
  return new Response(r.body, { status:r.status, headers: cors(new Headers({'content-type':'application/dns-message'}))});
}

export default async (request) => {
  const env = getEnv();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const dohPath = `/${env.PATH}`;

  if (pathname === '/' ) {
    // Treat DoH at root; otherwise let static /public handle
    if (url.searchParams.has('dns') || url.searchParams.has('name') || request.method === 'POST' || request.method === 'OPTIONS') {
      return handleDoH(request, env);
    }
    return fetch(request);
  }
  if (pathname === dohPath) return handleDoH(request, env);
  if (pathname === '/resolve') return handleResolve(request, env);
  if (pathname === '/ip') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || request.headers.get('cf-connecting-ip')
      || '0.0.0.0';
    return new Response(ip + '\\n', { headers: cors(new Headers({'content-type':'text/plain; charset=utf-8'}))});
  }
  if (pathname === '/ip-info') {
    const r = await fetch('https://1.1.1.1/cdn-cgi/trace');
    const txt = await r.text();
    return new Response(txt, { headers: cors(new Headers({'content-type':'text/plain; charset=utf-8'}))});
  }

  return fetch(request);
};

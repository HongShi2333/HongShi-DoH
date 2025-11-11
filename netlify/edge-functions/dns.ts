// HongShi-DoH Netlify Edge function (patched)
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

async function fetchJson(url) {
  // add safe UA and accept headers; do not set Host unless needed (some platforms forbid)
  const r = await fetch(url, {
    headers: {
      'Accept': 'application/dns-json, application/json;q=0.9, */*;q=0.1',
      'User-Agent': 'HongShi-DoH/edge'
    }
  });
  const text = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, statusText: r.statusText, text };
  }
  try { return { ok: true, json: JSON.parse(text) }; }
  catch { return { ok: true, json: { raw: text } }; }
}

async function queryDns(dohUrl, domain, type) {
  const u = new URL(dohUrl);
  if (u.pathname.endsWith('/dns-query')) u.pathname = '/resolve';
  u.searchParams.set('name', domain);
  u.searchParams.set('type', type);
  const out = await fetchJson(u.toString());
  if (!out.ok) throw new Error(`upstream ${u.host} ${out.status} ${out.statusText} :: ${out.text?.slice(0,200)}`);
  return out.json;
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
  try {
    let data;
    const origin = `${url.protocol}//${url.host}`;
    if (!doh || doh.startsWith(origin)) {
      data = await handleLocalDoh(name, type, env);
    } else {
      data = await queryDns(doh, name, type);
    }
    return new Response(JSON.stringify(data, null, 2), {headers: cors(new Headers({'content-type':'application/json','cache-control':'no-store'}))});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors(new Headers({'content-type':'application/json'})) });
  }
}

async function handleDoH(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors()});
  if (url.searchParams.has('name')) {
    const out = await fetchJson(jsonDoH(env) + url.search);
    if (!out.ok) return new Response(JSON.stringify({ error: 'upstream', ...out }), { status: 502, headers: cors(new Headers({'content-type':'application/json'})) });
    return new Response(JSON.stringify(out.json), { headers: cors(new Headers({'content-type':'application/json'}))});
  }
  const isGetDns = url.searchParams.has('dns');
  const isPost = request.method==='POST' && (request.headers.get('content-type')||'').startsWith('application/dns-message');
  if (!isGetDns && !isPost) return new Response('Bad Request', {status:400, headers:cors()});
  const upstream = isGetDns ? dnsDoH(env) + url.search : dnsDoH(env);
  const init = isGetDns ? { headers: { 'accept':'application/dns-message','user-agent':'HongShi-DoH/edge' } } : {
    method:'POST',
    headers: { 'accept':'application/dns-message', 'content-type':'application/dns-message', 'user-agent':'HongShi-DoH/edge' },
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
    return new Response(ip + '\n', { headers: cors(new Headers({'content-type':'text/plain; charset=utf-8'}))});
  }
  if (pathname === '/ip-info') {
    const r = await fetch('https://1.1.1.1/cdn-cgi/trace');
    const txt = await r.text();
    return new Response(txt, { headers: cors(new Headers({'content-type':'text/plain; charset=utf-8'}))});
  }

  return fetch(request);
};

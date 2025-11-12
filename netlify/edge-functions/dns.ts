const DEFAULT_DOH='cloudflare-dns.com';
export default async (request, context)=>{
  const env={DOH:Deno.env.get('DOH')??'',DOH_PATH:Deno.env.get('DOH_PATH')??Deno.env.get('HSD_PATH')??Deno.env.get('TOKEN')??'dns-query',IP_ENRICH:Deno.env.get('IP_ENRICH')??'',IPINFO_TOKEN:Deno.env.get('IPINFO_TOKEN')??''};
  const url=new URL(request.url); const p=url.pathname; const dohPath='/' + env.DOH_PATH; const dnsQueryEnabled=env.DOH_PATH==='dns-query';
  const cors=(h=new Headers())=>{h.set('Access-Control-Allow-Origin','*');h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');h.set('Access-Control-Allow-Headers','*');return h;};
  const dohHost=()=> (env.DOH||DEFAULT_DOH).replace(/^https?:\/\//,'').split('/')[0];
  const jsonDoH=`https://${dohHost()}/resolve`; const dnsDoH=`https://${dohHost()}/dns-query`;
  const fetchText=async(u,i)=>{const r=await fetch(u,i);const t=await r.text();return {ok:r.ok,status:r.status,statusText:r.statusText,text:t,headers:r.headers};};
  if(p==='/'&&request.method==='GET') return context.next();
  if(p==='/meta'){return new Response(JSON.stringify({dohPath:env.DOH_PATH,dnsQueryEnabled},null,2),{headers:cors(new Headers({'content-type':'application/json'}))});}
  if(p==='/ip'){
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-real-ip')||request.headers.get('cf-connecting-ip')||'0.0.0.0';
    let g={}; try{const raw=request.headers.get('x-nf-geo'); g=raw?JSON.parse(raw):{};}catch{}
    const base={ip,country_code:g.country?.code||g.country||undefined,country:undefined,province_code:g.subdivision?.code||g.subdivision||undefined,province:undefined,city:g.city||undefined,district:undefined,latitude:g.latitude??undefined,longitude:g.longitude??undefined,timezone:g.timezone??undefined,isp:undefined,asn:undefined,source:{platform:'netlify',enriched:false,provider:null}};
    let enriched=false; const provider=env.IP_ENRICH;
    try{
      if(provider==='ipwhois'){const r=await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`); if(r.ok){const j=await r.json(); base.country=base.country||j.country; base.province=base.province||j.region; base.city=base.city||j.city; base.district=base.district||j.district||undefined; base.latitude=base.latitude??j.latitude; base.longitude=base.longitude??j.longitude; base.timezone=base.timezone??j.timezone; base.isp=base.isp||j.connection?.isp||j.isp||j.org||undefined; base.asn=base.asn||j.connection?.asn||j.asn||undefined; enriched=true; } }
      else if(provider==='ipinfo'&&env.IPINFO_TOKEN){const r=await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(env.IPINFO_TOKEN)}`); if(r.ok){const j=await r.json(); base.country_code=base.country_code||j.country; base.province=base.province||j.region; base.city=base.city||j.city; base.isp=base.isp||(j.org&&j.org.split(' ').slice(1).join(' '))||j.org||undefined; base.asn=base.asn||(j.org&&j.org.split(' ')[0])||undefined; if(j.loc&&(!base.latitude||!base.longitude)){const [lat,lon]=j.loc.split(',').map(Number); base.latitude=base.latitude??lat; base.longitude=base.longitude??lon;} enriched=true; } }
      else if(provider==='ipapi'){const r=await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`); if(r.ok){const j=await r.json(); base.country=base.country||j.country_name; base.country_code=base.country_code||j.country; base.province=base.province||j.region; base.city=base.city||j.city; base.district=base.district||j.district||j.county||undefined; base.isp=base.isp||j.org||j.asn_org||undefined; base.asn=base.asn||j.asn||undefined; base.latitude=base.latitude??j.latitude; base.longitude=base.longitude??j.longitude; base.timezone=base.timezone??j.timezone; enriched=true; } }
    }catch{}
    base.source.enriched=enriched; base.source.provider=enriched?provider:null;
    return new Response(JSON.stringify(base,null,2),{headers:cors(new Headers({'content-type':'application/json'}))});
  }
  if(p==='/resolve'){
    const name=url.searchParams.get('name'); const type=url.searchParams.get('type')||'A'; const doh=url.searchParams.get('doh')||'';
    if(!name) return new Response(JSON.stringify({error:'name required'}),{status:400,headers:cors(new Headers({'content-type':'application/json'}))});
    const origin=`${url.protocol}//${url.host}`;
    try{
      if(!doh||doh.startsWith(origin)){
        const mk=(t)=>{const b=new URL(`https://${dohHost()}`); const g=b.hostname.includes('dns.google'); if(g) b.pathname='/resolve'; else{b.pathname='/dns-query'; b.searchParams.set('ct','application/dns-json');} b.searchParams.set('name',name); b.searchParams.set('type',t); return b.toString();};
        const [a4,a6,ns]=await Promise.all([fetchText(mk('A')),fetchText(mk('AAAA')),fetchText(mk('NS'))]);
        const parse=x=>{try{return JSON.parse(x.text)}catch{return {raw:x.text}}};
        if(!a4.ok&&!a6.ok&&!ns.ok) return new Response(JSON.stringify({error:'all upstream failed'}),{status:502,headers:cors(new Headers({'content-type':'application/json'}))});
        const j4=a4.ok?parse(a4):{}, j6=a6.ok?parse(a6):{}, js=ns.ok?parse(ns):{}; const nsRe=[]; (js.Answer||[]).forEach(r=>{if(r.type===2)nsRe.push(r)}); (js.Authority||[]).forEach(r=>{if(r.type===2||r.type===6)nsRe.push(r)});
        const out={Status:j4.Status||j6.Status||js.Status||0, Question:[].concat(j4.Question||[],j6.Question||[],js.Question||[]), Answer:[].concat(j4.Answer||[],j6.Answer||[],nsRe)};
        return new Response(JSON.stringify(out,null,2),{headers:cors(new Headers({'content-type':'application/json','cache-control':'no-store'}))});
      }
      const u=new URL(doh); const host=u.hostname.toLowerCase();
      const tryG=async()=>{const g=new URL(doh); g.pathname='/resolve'; g.searchParams.set('name',name); g.searchParams.set('type',type); return fetchText(g.toString(),{headers:{'accept':'application/dns-json'}})};
      const tryC=async()=>{const c=new URL(doh); c.pathname='/dns-query'; c.searchParams.set('name',name); c.searchParams.set('type',type); c.searchParams.set('ct','application/dns-json'); return fetchText(c.toString(),{headers:{'accept':'application/dns-json'}})};
      const pri=host.includes('dns.google')?await tryG():await tryC(); if(pri.ok) return new Response(pri.text,{headers:cors(new Headers({'content-type':'application/json'}))});
      const fb=host.includes('dns.google')?await tryC():await tryG(); if(fb.ok) return new Response(fb.text,{headers:cors(new Headers({'content-type':'application/json'}))});
      return new Response(JSON.stringify({error:'upstream error'}),{status:502,headers:cors(new Headers({'content-type':'application/json'}))});
    }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:502,headers:cors(new Headers({'content-type':'application/json'}))});}
  }
  if(p===dohPath){
    const u=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
    if(u.searchParams.has('name')){
      const joined=new URL(jsonDoH+u.search); const r=await fetchText(joined.toString(),{headers:{'accept':'application/dns-json'}});
      if(!r.ok) return new Response(JSON.stringify({error:'upstream'}),{status:502,headers:cors(new Headers({'content-type':'application/json'}))});
      return new Response(r.text,{headers:cors(new Headers({'content-type':'application/json'}))});
    }
    const isGet=u.searchParams.has('dns'); const isPost=request.method==='POST'&&(request.headers.get('content-type')||'').startsWith('application/dns-message');
    if(!isGet&&!isPost) return new Response('Bad Request',{status:400,headers:cors()});
    const upstream=isGet?dnsDoH+u.search:dnsDoH;
    const init=isGet?{headers:{'accept':'application/dns-message'}}:{method:'POST',headers:{'accept':'application/dns-message','content-type':'application/dns-message'},body:await request.arrayBuffer()};
    const r=await fetch(upstream,init); return new Response(r.body,{status:r.status,headers:cors(new Headers({'content-type':'application/dns-message'}))});
  }
  if(!dnsQueryEnabled && p==='/dns-query') return new Response('Not Found',{status:404,headers:cors(new Headers({'content-type':'text/plain; charset=utf-8'}))});
  if(p==='/host'){ let hn='unknown'; try{hn=(Deno).hostname?.()||hn;}catch{} if(hn==='localhost') hn=undefined; const id=request.headers.get('x-nf-request-id')||undefined; return new Response(JSON.stringify({platform:'netlify',hostname:hn,request_id:id},null,2),{headers:cors(new Headers({'content-type':'application/json'}))}); }
  return context.next();
};
export const runtime = 'edge';
export async function GET(req: Request){
  try{
    const url=new URL(req.url); const name=url.searchParams.get('name'); const type=url.searchParams.get('type')||'A'; const doh=url.searchParams.get('doh')||'';
    if(!name) return new Response(JSON.stringify({error:'name required'}),{status:400,headers:{'content-type':'application/json'}});
    let target=doh || (process.env.DOH ? `https://${process.env.DOH.replace(/^https?:\/\//,'').split('/')[0]}` : 'https://cloudflare-dns.com');
    const u=new URL(target); const isGoogle=u.hostname.toLowerCase().includes('dns.google'); u.pathname=isGoogle?'/resolve':'/dns-query'; if(!isGoogle) u.searchParams.set('ct','application/dns-json');
    u.searchParams.set('name',name); u.searchParams.set('type',type);
    const r=await fetch(u.toString(),{headers:{'accept':'application/dns-json','user-agent':'HongShi-DoH/edge'}}); const txt=await r.text();
    return new Response(txt,{status:r.ok?200:502,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}});
  }catch(e){ return new Response(JSON.stringify({error:String(e)}),{status:502,headers:{'content-type':'application/json'}}); }
}

import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const secret=()=>{const s=process.env.SESSION_SECRET;if(!s||s.length<32)throw Error('SESSION_SECRET missing');return s};
export const nonce=()=>randomBytes(32).toString('base64url');
export const challenge=v=>createHash('sha256').update(v).digest('base64url');
export function sign(data,ttl){const p=Buffer.from(JSON.stringify({...data,exp:Date.now()+ttl*1000})).toString('base64url');return p+'.'+createHmac('sha256',secret()).update(p).digest('base64url')}
export function verify(value,kind){try{const [p,s,...rest]=String(value||'').split('.');if(rest.length||!p||!s)return null;const expected=createHmac('sha256',secret()).update(p).digest();const actual=Buffer.from(s,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;const d=JSON.parse(Buffer.from(p,'base64url'));return d.kind===kind&&d.exp>Date.now()?d:null}catch{return null}}
export function readCookie(req,name){return (req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)}
export function cookie(name,value,age){return name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age}
export const session=req=>verify(readCookie(req,'cinema_session'),'session');
export const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',...headers}});
export function redirect(url,cookies=[]){const h=new Headers({Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h})}
export function origin(){const u=new URL(process.env.APP_ORIGIN);if(u.protocol!=='https:'||u.origin!==u.href.replace(/\/$/,''))throw Error('APP_ORIGIN invalid');return u.origin}
export const profileValid=s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(s);
export const sameOrigin=req=>req.headers.get('origin')===origin();

import {nonce,challenge,sign,verify,readCookie,cookie,session,json,redirect,origin,profileValid,sameOrigin} from '../lib/auth.mjs';
const ttl=7*86400;
export default {async fetch(req){try{
 const u=new URL(req.url),action=u.searchParams.get('action'),method=req.method;
 if(action==='login'&&method==='GET'){
 if(!process.env.YANDEX_CLIENT_ID||!process.env.YANDEX_CLIENT_SECRET)return json({error:'AUTH_NOT_CONFIGURED'},503);
 const state=nonce(),verifier=nonce(),url=new URL('https://oauth.yandex.ru/authorize');
 url.search=new URLSearchParams({response_type:'code',client_id:process.env.YANDEX_CLIENT_ID,redirect_uri:origin()+'/api/auth?action=callback',scope:'login:info',force_confirm:'yes',state,code_challenge:challenge(verifier),code_challenge_method:'S256'});
 return redirect(url.href,[cookie('cinema_oauth',sign({kind:'oauth',state,verifier},600),600)]);
 }
 if(action==='callback'&&method==='GET'){
 const old=verify(readCookie(req,'cinema_oauth'),'oauth'),clear=cookie('cinema_oauth','',0);
 if(!old||old.state!==u.searchParams.get('state')||!u.searchParams.get('code'))return redirect('/login.html?error=oauth',[clear]);
 const token=await fetch('https://oauth.yandex.ru/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:u.searchParams.get('code'),client_id:process.env.YANDEX_CLIENT_ID,client_secret:process.env.YANDEX_CLIENT_SECRET,code_verifier:old.verifier}),signal:AbortSignal.timeout(15000)});
 if(!token.ok)return redirect('/login.html?error=oauth',[clear]);
 const {access_token}=await token.json();if(!access_token)return redirect('/login.html?error=oauth',[clear]);
 const info=await fetch('https://login.yandex.ru/info?format=json',{headers:{Authorization:'OAuth '+access_token},signal:AbortSignal.timeout(15000)});
 if(!info.ok)return redirect('/login.html?error=oauth',[clear]);
 const user=await info.json();if(!user.id||!user.login)return redirect('/login.html?error=oauth',[clear]);
 return redirect('/login.html',[clear,cookie('cinema_session',sign({kind:'session',id:String(user.id),login:String(user.login),profile:null},ttl),ttl)]);
 }
 const user=session(req);
 if(action==='me'&&method==='GET')return user?json({id:user.id,login:user.login,profile:user.profile}):json({error:'UNAUTHORIZED'},401);
 if(!user)return json({error:'UNAUTHORIZED'},401);
 if(method!=='POST'||!sameOrigin(req))return json({error:'FORBIDDEN'},403);
 if(action==='logout')return json({ok:true},200,{'Set-Cookie':cookie('cinema_session','',0)});
 if(action==='profile'){
 const {profile}=await req.json();if(!profileValid(profile))return json({error:'INVALID_PROFILE'},400);
 return json({ok:true},200,{'Set-Cookie':cookie('cinema_session',sign({kind:'session',id:user.id,login:user.login,profile},ttl),ttl)});
 }
 return json({error:'NOT_FOUND'},404);
 }catch{return json({error:'AUTH_UNAVAILABLE'},503)}}};

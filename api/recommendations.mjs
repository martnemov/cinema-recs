import {getCache} from '@vercel/functions';
import {session,json} from '../lib/auth.mjs';
import {recommend} from '../lib/recommend.mjs';
const ratings=getCache({namespace:'cinema-user-ratings-v2'}), recs=getCache({namespace:'cinema-user-recommendations-v1'});
export default {async fetch(req){if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);const user=session(req);if(!user?.profile)return json({error:'UNAUTHORIZED'},401);const cacheKey=JSON.stringify([user.id,user.profile]);try{const snapshot=await ratings.get(cacheKey);if(!snapshot?.items?.length)return json({error:'SYNC_REQUIRED'},409);const old=await recs.get(cacheKey);if(old?.syncedAt===snapshot.syncedAt)return json(old);const items=await recommend(snapshot.items,{key:process.env.KINOPOISK_API_KEY});const result={items,syncedAt:snapshot.syncedAt};await recs.set(cacheKey,result,{ttl:604800});return json(result)}catch{return json({error:'RECOMMENDATIONS_UNAVAILABLE'},503)}}};

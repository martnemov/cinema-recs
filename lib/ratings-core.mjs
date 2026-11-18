export class RatingsError extends Error {
  constructor(code, status=0) { super(code); this.code=code; this.upstreamStatus=status; }
}
export const isRating = x => x && Number.isSafeInteger(x.id) && x.id>0 && Number.isInteger(x.score) && x.score>=1 && x.score<=10 && typeof x.title==='string' && x.title.length>0;
export function safePoster(value) {
  try {const u=new URL(value);if(u.protocol==='http:')u.protocol='https:';return u.protocol==='https:'?u.href:'';}catch{return '';}
}
export function fromVote(v, previous={}) {
  if(!Number.isSafeInteger(v.kinopoiskId)||v.kinopoiskId<1||!Number.isInteger(v.userRating)||v.userRating<1||v.userRating>10)throw new RatingsError('INVALID_PERSONAL_RATING');
  const genres=Array.isArray(v.genres)?v.genres.map(g=>g?.genre).filter(g=>typeof g==='string'):[];
  const series=['TV_SHOW','MINI_SERIES','TV_SERIES'].includes(v.type);
  const animation=genres.includes('мультфильм')||genres.includes('аниме');
  const anime=genres.includes('аниме')||(animation&&v.countries?.some(c=>c.country==='Япония'));
  const category=anime?'anime':animation?'cartoon':series?'series':'film';
  const year=Number(v.year);
  const result={...previous,id:v.kinopoiskId,title:(v.nameRu||v.nameOriginal||v.nameEn||previous.title||'').trim(),year:Number.isInteger(year)&&year>=1800&&year<=2200?year:previous.year??null,genre:genres[0]||previous.genre||'',genres:genres.length?genres:previous.genres||[previous.genre].filter(Boolean),format:series?'series':'film',category,score:v.userRating,poster:safePoster(v.posterUrlPreview||v.posterUrl)||previous.poster||'',source:'api'};
  if(previous.category&&(!genres.length||previous.category==='anime'&&animation))result.category=previous.category;
  if(!isRating(result))throw new RatingsError('INVALID_PERSONAL_RATING');return result;
}
export function mergeRatings(baseline, incoming) {
  if(!Array.isArray(incoming)||!incoming.length||!incoming.every(isRating))throw new RatingsError('EMPTY_OR_INVALID_SNAPSHOT');
  const old=new Map(baseline.filter(isRating).map(x=>[x.id,x]));
  const fresh=new Map(incoming.map(x=>[x.id,{...old.get(x.id),...x}]));
  const seen=new Set();return [...fresh.values(),...old.values()].filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;});
}
export async function collectRatings({key,fetchImpl=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),onProgress=()=>{},previous=[],signal}) {
  if(!key)throw new RatingsError('API_KEY_MISSING');
  const known=new Map(previous.map(x=>[x.id,x]));const raw=[];let pages=1,total=0;
  const deadline=Date.now()+250000;
  for(let page=1;page<=pages;page++) {
    if(signal?.aborted)throw new RatingsError('CANCELLED');
    if(Date.now()>deadline)throw new RatingsError('SYNC_TIMEOUT');
    if(page>1)await pause(550);
    let response;
    try {response=await fetchImpl(`https://kinopoiskapiunofficial.tech/api/v1/kp_users/martnemov/votes?page=${page}`,{headers:{'X-API-KEY':key,Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});}catch{throw new RatingsError('API_UNAVAILABLE');}
    if(!response.ok)throw new RatingsError(response.status===401?'API_KEY_REJECTED':response.status===402?'API_QUOTA_EXCEEDED':response.status===429?'API_RATE_LIMIT':'API_UNAVAILABLE',response.status);
    let data;try {data=await response.json();}catch{throw new RatingsError('INVALID_API_RESPONSE');}
    if(page===1){pages=data.totalPages;total=data.total;if(!Number.isInteger(pages)||pages<1||pages>300||!Number.isInteger(total)||total<1)throw new RatingsError('EMPTY_PROFILE');}
    if(!Array.isArray(data.items)||!data.items.length)throw new RatingsError('INCOMPLETE_API_RESPONSE');
    raw.push(...data.items);onProgress({page,totalPages:pages,received:raw.length,reportedTotal:total});
  }
  const records=[...new Map(raw.map(v=>{const x=fromVote(v,known.get(v.kinopoiskId));return [x.id,x];})).values()];
  if(records.length<Math.min(total,pages*20))throw new RatingsError('INCOMPLETE_API_RESPONSE');
  return {items:records,reportedTotal:total,totalPages:pages,received:records.length,limited:records.length<total};
}

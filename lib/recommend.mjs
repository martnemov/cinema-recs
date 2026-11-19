import {safePoster} from './ratings-core.mjs';
export async function recommend(ratings,{fetchImpl=fetch,key,exclude=[]}={}){
 const seen=new Set([...ratings.map(x=>x.id),...exclude]), candidates=new Map();
 const groups=new Map();
 for(const r of ratings.filter(x=>x.score>=8).sort((a,b)=>b.score-a.score)){const g=r.category+':'+r.genre;if(!groups.has(g))groups.set(g,r);}
 const seeds=[...groups.values()].slice(0,8);
 const get=async path=>{const r=await fetchImpl('https://kinopoiskapiunofficial.tech/api/v2.2/films/'+path,{headers:{'X-API-KEY':key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('KINOPOISK_'+r.status);return r.json()};
 for(let i=0;i<seeds.length;i+=4){const batch=await Promise.all(seeds.slice(i,i+4).map(async seed=>({seed,data:await get(seed.id+'/similars')})));for(const {seed,data} of batch){for(const item of data.items||[]){const id=item.filmId??item.kinopoiskId;if(!Number.isSafeInteger(id)||seen.has(id))continue;const c=candidates.get(id)||{id,weight:0,refs:[]};c.weight+=(seed.score-6);c.refs.push(seed);candidates.set(id,c);}}}
 const top=[...candidates.values()].sort((a,b)=>b.weight-a.weight).slice(0,30),result=[];
 for(let i=0;i<top.length;i+=5){const batch=await Promise.all(top.slice(i,i+5).map(async c=>{const f=await get(c.id);const genres=(f.genres||[]).map(g=>g.genre).filter(Boolean),series=['TV_SERIES','MINI_SERIES','TV_SHOW'].includes(f.type),format=series?'series':'film',category=genres.includes('аниме')?'anime':genres.includes('мультфильм')?'cartoon':format;const title=f.nameRu||f.nameOriginal||f.nameEn;if(!title)return null;return {id:c.id,title,original_title:f.nameOriginal||f.nameEn||'',year:Number(f.year)||null,genres,format,category,type:category==='anime'?'Аниме':category==='cartoon'?(series?'Мультсериал':'Мультфильм'):series?'Сериал':'Фильм',kinopoisk_rating:Number(f.ratingKinopoisk)||0,rating_count:Number(f.ratingKinopoiskVoteCount)||0,kinopoisk_url:'https://www.kinopoisk.ru/'+format+'/'+c.id+'/',poster_source:safePoster(f.posterUrlPreview||f.posterUrl),why:'Кинопоиск относит эту историю к похожим на '+c.refs.map(r=>'«'+r.title+'» ('+r.score+'/10)').join(', ')+'.',match_label:'Похоже на «'+c.refs[0].title+'»',rating_references:c.refs.map(r=>r.id)};}));result.push(...batch.filter(Boolean));}
 return result.map((item,i)=>({...item,priority:i+1}));
}

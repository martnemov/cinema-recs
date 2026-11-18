import {getCache} from '@vercel/functions';
import {seedRatings} from '../lib/seed-ratings.mjs';
import {collectRatings,mergeRatings,isRating} from '../lib/ratings-core.mjs';
const cache=getCache({namespace:'martnemov-cinema-prj_WFhFseXmYAWwDT3tLBSXegAqyt0Y-ratings-v1'});
const messages={API_KEY_MISSING:'Серверный ключ не настроен.',API_KEY_REJECTED:'API отклонил ключ.',API_QUOTA_EXCEEDED:'Исчерпан лимит запросов API.',API_RATE_LIMIT:'API просит уменьшить частоту запросов.',EMPTY_PROFILE:'API вернул пустой профиль.',INCOMPLETE_API_RESPONSE:'API вернул неполный список страниц.',INVALID_PERSONAL_RATING:'API вернул некорректные личные оценки.',INVALID_API_RESPONSE:'API вернул неожиданный ответ.',API_UNAVAILABLE:'API временно недоступен.',SYNC_TIMEOUT:'Обновление заняло слишком много времени.',CANCELLED:'Обновление прервано.'};
export default {
  fetch(request) {
    if(request.method!=='GET')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
    const encoder=new TextEncoder();let closed=false;
    const stream=new ReadableStream({
      async start(controller){
        const send=data=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));}catch{closed=true;}};
        let previous=seedRatings;
        try {
          try {const snapshot=await cache.get('last-success');if(snapshot?.items?.length&&snapshot.items.every(isRating)){previous=mergeRatings(seedRatings,snapshot.items);send({type:'cached',...snapshot,items:previous});}}catch{console.error(JSON.stringify({code:'RATINGS_CACHE_READ_FAILED'}));}
          send({type:'start',profile:'martnemov'});
          const result=await collectRatings({key:process.env.KINOPOISK_API_KEY,previous,signal:request.signal,onProgress:progress=>send({type:'progress',...progress})});
          const items=mergeRatings(previous,result.items);const snapshot={items,profile:'martnemov',syncedAt:new Date().toISOString(),apiCount:result.received,reportedTotal:result.reportedTotal,totalPages:result.totalPages,archivedCount:items.length-result.received,limited:true};
          try {await cache.set('last-success',snapshot,{ttl:604800,name:'personal-ratings'});}catch{console.error(JSON.stringify({code:'RATINGS_CACHE_WRITE_FAILED'}));}
          send({type:'ratings',...snapshot});
          console.log(JSON.stringify({event:'ratings_sync_ok',apiCount:result.received,mergedCount:items.length,pages:result.totalPages}));
        }catch(error){const code=Object.hasOwn(messages,error?.code)?error.code:'API_UNAVAILABLE';console.error(JSON.stringify({event:'ratings_sync_failed',code,upstreamStatus:error?.upstreamStatus||0}));send({type:'error',code,message:messages[code],preserved:true});}
        finally {if(!closed){closed=true;try{controller.close();}catch{}}}
      },
      cancel(){closed=true;}
    });
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
};

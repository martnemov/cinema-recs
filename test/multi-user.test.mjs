import test from 'node:test';
import assert from 'node:assert/strict';
import {sign,verify,profileValid} from '../lib/auth.mjs';
import {collectRatings} from '../lib/ratings-core.mjs';
import {recommend} from '../lib/recommend.mjs';
test('session signature and expiry',()=>{process.env.SESSION_SECRET='x'.repeat(64);const value=sign({kind:'session',id:'1',profile:'demo'},60);assert.equal(verify(value,'session').id,'1');assert.equal(verify(value+'x','session'),null);assert.equal(verify(value,'oauth'),null);assert.equal(verify(sign({kind:'session'},-1),'session'),null);assert.equal(profileValid('../foo'),false)});
test('collect uses requested profile',async()=>{let called;const r=await collectRatings({profileId:'another-user',key:'fake',fetchImpl:async u=>{called=u;return Response.json({totalPages:1,total:1,items:[{kinopoiskId:42,userRating:9,nameRu:'Film',type:'FILM',year:2020}]})}});assert.match(called,/kp_users\/another-user\/votes/);assert.equal(r.items[0].score,9)});
test('recommend excludes rated movies and cites correct seed',async()=>{const ratings=[{id:42,title:'Seed',score:9,genre:'drama',category:'film'}];const result=await recommend(ratings,{key:'fake',fetchImpl:async u=>Response.json(u.endsWith('/similars')?{items:[{filmId:42},{filmId:43}]}:{nameRu:'New',year:2020,type:'FILM',genres:[{genre:'драма'}],ratingKinopoisk:8})});assert.deepEqual(result.map(x=>x.id),[43]);assert.deepEqual(result[0].rating_references,[42])});

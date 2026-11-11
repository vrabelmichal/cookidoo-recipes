import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validateRecipe, buildPayload, fingerprint, verifyReadback } from '../scripts/recipe.mjs';
import { client, cookieHeader, target } from '../scripts/cookidoo-client.mjs';
import { upload } from '../scripts/upload.mjs';
import { visibleRecipe } from '../scripts/website-recipe.mjs';

const recipe = JSON.parse(readFileSync(new URL('../data/zupa-pieczarkowa-thermomix.json', import.meta.url)));
const copy = () => structuredClone(recipe);
const payload = buildPayload(recipe);
const readback = () => ({ recipeContent: { name: recipe.name, recipeIngredient: payload.ingredients.map(x=>x.text), recipeInstructions: payload.instructions.map(x=>({text:x.text})), tool: ['TM7'] } });
function fixture({ fail = '', state = null, mismatch = false, probeFail = false } = {}) {
  const calls = [];
  const store = { value: state, read: async()=>store.value, write: async s=>{ store.value=structuredClone(s); } };
  const api = { base: target(), probe: async()=>{ calls.push('probe'); if(probeFail) throw new Error('auth rejected'); },
    request: async(method,id,body)=>{
      calls.push([method,id,body]);
      if (method === fail) throw new Error(`${method} failed`);
      if(method==='POST') return {recipeId:'local-test-id'};
      if(method==='GET') { const b=readback(); if(mismatch) b.recipeContent.recipeInstructions.reverse(); return b; }
    } };
  return { api, store, calls, recipe, confirm:true };
}
test('fixture and upload match visible website ingredients and six short steps',()=>{
  const html=readFileSync(new URL('../zupa-pieczarkowa-thermomix.html',import.meta.url),'utf8');
  const source=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(recipe.name,source.name);
  const visible = visibleRecipe(html);
  assert.deepEqual(recipe.ingredients,visible.ingredients);
  assert.deepEqual(recipe.steps.map(s=>({name:s.name,text:s.text})),visible.steps.map(s=>({name:s.name,text:s.text})));
  for (let i=0;i<6;i++) {
    const s=visible.steps[i];
    assert.equal(payload.instructions[i].text,`${s.name}\n${s.text}${s.settings.length ? `\n${s.settings.join(' / ')}` : ''}`);
    assert.ok(payload.instructions[i].text.length < 420);
    assert.doesNotMatch(payload.instructions[i].text,/Uwagi:|Ustawienia:/);
  }
  assert.ok(payload.instructions[0].text.length < 180);
  assert.equal(recipe.servings,4); assert.equal(recipe.ingredients.length,12); assert.equal(recipe.steps.length,6);
  assert.equal(source.totalTime,'PT43M'); assert.equal(recipe.totalTime,43*60); assert.equal(recipe.prepTime,600);
  assert.ok(recipe.notes.every(n=>!n.includes('?')));
});
test('payload preserves exact settings, reverse direction and safeguards as text',()=>{
  assert.deepEqual(recipe.steps.slice(0,5).map(s=>[s.machine.seconds,s.machine.temperature,s.machine.speed,s.machine.reverse]),[
    [5,null,5,false],[180,120,1,false],[480,120,1,true],[1200,100,1,true],[120,90,1,true]]);
  assert.equal(recipe.steps.reduce((n,s)=>n+(s.machine?.seconds??0),0),1985);
  for(const i of [2,3,4]) assert.match(payload.instructions[i].text,/Obroty wsteczne 1/);
  assert.ok(payload.instructions.every(s=>s.annotations.length===0));
  assert.doesNotMatch(payload.instructions[5].text,/Ustawienia/);
  assert.match(payload.hints,/maksymalnego poziomu napełnienia/);
  assert.match(payload.instructions[2].text,/pokrywę TM7/);
  assert.match(payload.instructions[4].text,/zahartuj/);
});
test('invalid versions, locale, model, times, ingredients and machine fields fail',()=>{
  for(const patch of [{schemaVersion:2},{id:'../x'},{locale:'de-DE'},{model:'TM6'},{servings:0},{totalTime:NaN},{prepTime:99999},{ingredients:[]},{steps:[]},{notes:null},{name:''}]) {
    assert.throws(()=>validateRecipe({...copy(),...patch}));
  }
  for(const patch of [{seconds:-1},{temperature:160},{reverse:'true'},{speed:20},{reverse:true,speed:5}]) {
    const r=copy(); Object.assign(r.steps[0].machine,patch); assert.throws(()=>validateRecipe(r));
  }
  assert.notEqual(fingerprint(recipe),fingerprint({...copy(),servings:5}));
});
test('read-back checks exact title, content and order, not just counts',()=>{
  assert.equal(verifyReadback(readback(),recipe),true);
  for(const mutate of [b=>b.recipeContent.name='other',b=>b.recipeContent.recipeIngredient.reverse(),b=>b.recipeContent.recipeInstructions.pop(),b=>b.recipeContent.recipeInstructions[0].text='changed']) {
    const b=readback(); mutate(b); assert.throws(()=>verifyReadback(b,recipe),/mismatch/);
  }
  assert.throws(()=>verifyReadback({},recipe));
  const wrongModel=readback(); wrongModel.recipeContent.tool=['TM6'];
  assert.throws(()=>verifyReadback(wrongModel,recipe),/mismatch/);
});
test('TM7 model and lid guidance replace older-model instructions',()=>{
  assert.deepEqual(payload.tools,['TM7']);
  const content=JSON.stringify(payload);
  assert.doesNotMatch(content,/TM5|TM6|koszyczek|miarki/);
  assert.match(content,/osłoną pokrywy/);
  assert.match(content,/2,2 l/);
  assert.match(content,/nie wyższej niż 100°C/);
  assert.match(content,/prędkości nie większej niż 2/);
});
test('target rejects host injection, insecure hosts and wrong locales',()=>{
  for(const host of ['https://cookidoo.pl','cookidoo.pl.evil.test','evil.test','cookidoo.pl/path','cookidoo.pl:443']) assert.throws(()=>target(host));
  assert.throws(()=>target('cookidoo.pl','de-DE')); assert.match(target(),/^https:\/\/cookidoo.pl/);
});
test('Netscape cookies filter domain, HttpOnly, expiry, path and raw headers',()=>{
  const rows=[
    '# Netscape HTTP Cookie File',
    '#HttpOnly_.cookidoo.pl\tTRUE\t/\tTRUE\t0\t_oauth2_proxy\tFAKE_TEST_VALUE',
    'cookidoo.pl\tFALSE\t/\tTRUE\t10\texpired\tNO',
    'unrelated.test\tTRUE\t/\tTRUE\t0\tother\tNO',
    '.pl\tTRUE\t/\tTRUE\t0\tparent\tNO',
    'cookidoo.pl\tFALSE\t/admin\tTRUE\t0\tpath\tNO',
    'evil.cookidoo.pl\tFALSE\t/\tTRUE\t0\tchild\tNO',
  ].join('\n');
  assert.equal(cookieHeader(rows,'cookidoo.pl',100),'_oauth2_proxy=FAKE_TEST_VALUE');
  assert.throws(()=>cookieHeader('foo=bar','cookidoo.pl'));
  assert.throws(()=>cookieHeader(rows,'cookidoo.de'));
});
test('transport uses manual redirects and bounded timeout; errors never reveal response or credentials',async()=>{
  for(const response of [new Response('secret response',{status:302,headers:{Location:'https://evil.test/?token=FAKE'}}),new Response('secret response',{status:401}),new Response('secret response',{status:403}),new Response('secret response',{headers:{'content-type':'text/html'}}),new Response('secret response',{headers:{'content-type':'application/json'}})]) {
    let count=0;
    const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE_COOKIE',fetchImpl:async(url,options)=>{
      count++; assert.equal(options.redirect,'manual'); assert.ok(options.signal instanceof AbortSignal); assert.match(url,/^https:\/\/cookidoo.pl\//); return response;
    }});
    await assert.rejects(api.request('GET'),e=>!e.message.includes('secret')&&!e.message.includes('FAKE')&&!e.message.includes('evil'));
    assert.equal(count,1);
  }
  const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE',fetchImpl:async()=>{throw new Error('FAKE secret transport exception');}});
  await assert.rejects(api.request('POST'),/network, timeout/);
  await assert.rejects(api.request('GET','../../evil'),/Invalid recipe ID/);
});
test('read-only probe requires the known items schema',async()=>{
  for(const data of [{items:[]},{recipeContent:{}},[]]) {
    const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE',fetchImpl:async()=>Response.json(data)});
    if(data.items) await api.probe(); else await assert.rejects(api.probe(),/Unrecognized/);
  }
});
test('PATCH accepts successful empty/non-JSON acknowledgements; GET and POST still require JSON',async()=>{
  for (const response of [new Response(null,{status:204}),new Response(''),new Response('OK',{headers:{'content-type':'text/plain'}}),Response.json({saved:true})]) {
    const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE',fetchImpl:async()=>response});
    assert.equal(await api.request('PATCH','local-test-id',payload),null);
  }
  for (const method of ['GET','POST']) {
    const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE',fetchImpl:async()=>new Response('OK')});
    await assert.rejects(api.request(method),/expected JSON/);
  }
  const api=client({host:'cookidoo.pl',locale:'pl-PL',cookies:'FAKE',fetchImpl:async()=>new Response('private error',{status:500})});
  await assert.rejects(api.request('PATCH','local-test-id',payload),/HTTP 500/);
});
test('no confirmation or failed auth produces no writes',async()=>{
  const a=fixture(); a.confirm=false; await assert.rejects(upload(a),/confirm/); assert.deepEqual(a.calls,[]); assert.equal(a.store.value,null);
  const b=fixture({probeFail:true}); await assert.rejects(upload(b),/auth/); assert.deepEqual(b.calls,['probe']); assert.equal(b.store.value,null);
});
test('create, patch, read-back, then repeated import performs no writes',async()=>{
  const f=fixture(); const result=await upload(f); assert.equal(result.existing,false); assert.match(result.url,/local-test-id\/edit$/);
  assert.deepEqual(f.calls.map(x=>Array.isArray(x)?x[0]:x),['probe','POST','PATCH','GET']);
  assert.equal(f.store.value.status,'complete'); f.calls.length=0;
  assert.equal((await upload(f)).existing,true); assert.deepEqual(f.calls.map(x=>Array.isArray(x)?x[0]:x),['probe','GET']);
});
test('failed POST leaves uncertainty and blocks subsequent attempts',async()=>{
  const f=fixture({fail:'POST'}); await assert.rejects(upload(f)); assert.equal(f.store.value.status,'creating');
  f.calls.length=0; await assert.rejects(upload({...f,resume:true}),/uncertain/); assert.deepEqual(f.calls,[]);
});
test('invalid create response or failure saving returned ID cannot trigger a second POST',async()=>{
  for(const failure of ['invalid-id','disk-full']) {
    const f=fixture(); const request=f.api.request;
    f.api.request=async(...args)=>args[0]==='POST'&&failure==='invalid-id'?{}:request(...args);
    const write=f.store.write;
    f.store.write=async s=>{if(s.recipeId&&failure==='disk-full')throw new Error('disk full');await write(s);};
    await assert.rejects(upload(f)); assert.equal(f.store.value.status,'creating');
    await assert.rejects(upload({...f,resume:true}),/uncertain/);
  }
});
test('failed PATCH keeps ID; resume recognizes already-saved content without writes',async()=>{
  const f=fixture({fail:'PATCH'}); await assert.rejects(upload(f)); assert.equal(f.store.value.recipeId,'local-test-id');
  await assert.rejects(upload(f),/resume/);
  const resumed=fixture({state:f.store.value}); await upload({...resumed,resume:true});
  assert.deepEqual(resumed.calls.map(x=>Array.isArray(x)?x[0]:x),['probe','GET']);
  assert.equal(resumed.store.value.status,'complete');
});
test('resume patches an incomplete draft and verifies it without a second POST',async()=>{
  const f=fixture({fail:'PATCH'}); await assert.rejects(upload(f));
  const resumed=fixture({state:f.store.value});
  const request=resumed.api.request; let first=true;
  resumed.api.request=async(...args)=>{
    const result=await request(...args);
    if(args[0]==='GET'&&first) {first=false;result.recipeContent.recipeInstructions=[];}
    return result;
  };
  await upload({...resumed,resume:true});
  assert.deepEqual(resumed.calls.map(x=>Array.isArray(x)?x[0]:x),['probe','GET','PATCH','GET']);
  assert.equal(resumed.store.value.status,'complete');
});
test('read-back failure does not mark complete; changed recipe and target cannot reuse ledger',async()=>{
  const f=fixture({mismatch:true}); await assert.rejects(upload(f),/mismatch/); assert.equal(f.store.value.status,'draft');
  await assert.rejects(upload({...f,recipe:{...copy(),servings:5},resume:true}),/different/);
  await assert.rejects(upload({...f,api:{...f.api,base:target('cookidoo.de')},resume:true}),/different/);
  const resumed=fixture({state:f.store.value}); resumed.api.request=async()=>({recipeContent:{name:'unrelated'}});
  await assert.rejects(upload({...resumed,resume:true}),/title differs/);
});
test('CLI validate and preview work without cookies; malformed flags and upload without consent fail',()=>{
  const run=(...args)=>spawnSync(process.execPath,['scripts/cookidoo-upload.mjs',...args],{encoding:'utf8',env:{...process.env,CI:'true'}});
  for(const command of ['validate','preview']) {
    const r=run(command,'data/zupa-pieczarkowa-thermomix.json'); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/pl-PL/);
  }
  assert.equal(run('upload','data/zupa-pieczarkowa-thermomix.json').status,1);
  assert.equal(run('check-auth').status,1);
  assert.equal(run('preview','data/zupa-pieczarkowa-thermomix.json','--hosst','evil.test').status,1);
});

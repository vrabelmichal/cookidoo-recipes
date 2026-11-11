import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachImage} from '../scripts/cookidoo-image.mjs';

test('signed photo upload never sends session cookies to Cloudinary and checks read-back',async()=>{
  const calls=[];
  const api={request:async(method,id,body)=>{
    calls.push({method,id,body});
    if(method==='POST')return {signature:'a'.repeat(40)};
    if(method==='GET')return {recipeContent:{image:'https://res.cloudinary.com/vorwerk-users-gc/image/upload/customer-recipes/test.png'}};
  }};
  const image=await attachImage({api,recipeId:'test-id',file:new URL('../assets/zupa-pieczarkowa.png',import.meta.url),fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload');
    assert.equal(options.headers,undefined);
    assert.equal(options.redirect,'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body.get('file').type,'image/png');
    return Response.json({public_id:'customer-recipes/test',format:'png'});
  }});
  assert.equal(image,'customer-recipes/test.png');
  assert.deepEqual(calls.map(x=>[x.method,x.id]),[['POST','image/signature'],['PATCH','test-id'],['GET','test-id']]);
});

test('failed image upload does not patch a recipe or expose upload errors',async()=>{
  const calls=[];
  const api={request:async(method)=>{calls.push(method);return {signature:'a'.repeat(40)};}};
  await assert.rejects(attachImage({api,recipeId:'test-id',file:new URL('../assets/zupa-pieczarkowa.png',import.meta.url),fetchImpl:async()=>{throw Error('private signature detail');}}),e=>e.message.includes('Photo upload failed')&&!e.message.includes('private'));
  assert.deepEqual(calls,['POST']);
});

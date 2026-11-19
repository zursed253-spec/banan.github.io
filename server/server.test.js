'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createApp } = require('./server');

function waitFor(s, match, ms=3000) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('message timeout'));},ms);
    function cleanup(){clearTimeout(timer);s.off('message',receive);s.off('close',closed);}
    function closed(){cleanup();reject(new Error('socket closed'));}
    function receive(raw){const m=JSON.parse(raw.toString());if(match(m)){cleanup();resolve(m);}}
    s.on('message',receive);s.on('close',closed);
  });
}
function connect(url){
  return new Promise((resolve,reject)=>{
    const s=new WebSocket(url);
    s.once('open',()=>resolve(s));s.once('error',reject);
  });
}
test('health, join, collision, relay and reconnection',async t=>{
  const {server,wss}=createApp();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{for(const s of wss.clients)s.terminate();await new Promise(ok=>server.close(ok));});
  const port=server.address().port;
  const res=await fetch('http://127.0.0.1:'+port+'/health');
  assert.equal(res.status,200);
  assert.equal((await res.json()).ok,true);
  const url='ws://127.0.0.1:'+port+'/ws';
  const host=await connect(url),guest=await connect(url),third=await connect(url);
  const hosted=waitFor(host,m=>m.t==='hosted');
  host.send(JSON.stringify({t:'host',code:'ABCDE'}));
  assert.equal((await hosted).code,'ABCDE');
  const collision=waitFor(third,m=>m.t==='error');
  third.send(JSON.stringify({t:'host',code:'ABCDE'}));
  assert.equal((await collision).code,'code_taken');
  const hostReady=waitFor(host,m=>m.t==='ready'),guestReady=waitFor(guest,m=>m.t==='ready');
  guest.send(JSON.stringify({t:'join',code:'ABCDE'}));
  assert.equal((await hostReady).role,0);
  assert.equal((await guestReady).role,1);
  const full=waitFor(third,m=>m.t==='error');
  third.send(JSON.stringify({t:'join',code:'ABCDE'}));
  assert.equal((await full).code,'room_full');
  const relayed=waitFor(guest,m=>m.t==='data');
  host.send(JSON.stringify({t:'data',payload:{t:'g',n:1,d:{m:3}}}));
  assert.deepEqual((await relayed).payload,{t:'g',n:1,d:{m:3}});
  const left=waitFor(host,m=>m.t==='peer_left');
  guest.close();
  assert.equal((await left).t,'peer_left');
  const rejoined=waitFor(third,m=>m.t==='ready');
  third.send(JSON.stringify({t:'join',code:'ABCDE'}));
  assert.equal((await rejoined).role,1);
  host.close();
});

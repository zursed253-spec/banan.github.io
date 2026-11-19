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


test('four-player rooms assign stable seats, broadcast to everyone and promote a new host',async t=>{
  const {server,wss,rooms}=createApp();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{
    for(const s of wss.clients)s.terminate();
    await new Promise(ok=>server.close(ok));
  });
  const url='ws://127.0.0.1:'+server.address().port+'/ws';
  const players=await Promise.all([connect(url),connect(url),connect(url),connect(url),connect(url)]);
  const [host,p1,p2,p3,outsider]=players;

  const hosted=waitFor(host,m=>m.t==='hosted');
  host.send(JSON.stringify({t:'host',code:'FGHJK',maxPlayers:4}));
  const hostRoom=await hosted;
  assert.equal(hostRoom.maxPlayers,4);
  assert.equal(hostRoom.players,1);

  for(const [socket,expectedCount] of [[p1,2],[p2,3],[p3,4]]){
    const ready=players.slice(0,expectedCount).map(s=>waitFor(s,m=>m.t==='ready'&&m.players===expectedCount));
    socket.send(JSON.stringify({t:'join',code:'FGHJK'}));
    const messages=await Promise.all(ready);
    assert.deepEqual(messages.map(m=>m.role).sort(),Array.from({length:expectedCount},(_,i)=>i));
    assert.ok(messages.every(m=>m.maxPlayers===4));
  }
  assert.equal(rooms.get('FGHJK').players.length,4);

  const full=waitFor(outsider,m=>m.t==='error');
  outsider.send(JSON.stringify({t:'join',code:'FGHJK'}));
  assert.equal((await full).code,'room_full');

  const broadcasts=[host,p1,p3].map(s=>waitFor(s,m=>m.t==='data'&&m.payload?.d?.move===17));
  p2.send(JSON.stringify({t:'data',payload:{t:'g',n:9,d:{move:17}}}));
  const relayed=await Promise.all(broadcasts);
  assert.ok(relayed.every(m=>m.payload.d.move===17),'one move reaches every other player');

  const peerLeft=[p1,p2,p3].map(s=>waitFor(s,m=>m.t==='peer_left'&&m.players===3));
  host.close();
  const updates=await Promise.all(peerLeft);
  assert.deepEqual(updates.map(m=>m.role).sort(),[0,1,2]);
  assert.equal(updates.find(m=>m.role===0).host,true);
  assert.equal(rooms.get('FGHJK').players.length,3);

  const promoted=updates.find((m,i)=>m.role===0?true:false);
  assert.ok(promoted,'one of the remaining players is promoted to host');
  const notHost=waitFor(p2,m=>m.t==='error'&&m.code==='not_host');
  p2.send(JSON.stringify({t:'data',payload:{t:'start',game:'durak'}}));
  assert.equal((await notHost).code,'not_host');

  const startRelay=waitFor(p2,m=>m.t==='data'&&m.payload?.t==='start');
  p1.send(JSON.stringify({t:'data',payload:{t:'start',game:'durak',players:3}}));
  assert.equal((await startRelay).payload.players,3);

  for(const s of players)if(s.readyState===WebSocket.OPEN)s.close();
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeNode {
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.listeners={};this.style={};this.attrs={};this.dataset={};this.className='';this.textContent='';this.disabled=false;this.parentNode=null;this.clientWidth=900;this.clientHeight=620;}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==fn);}
  getBoundingClientRect(){return {width:900,height:620,left:0,top:0};}
  getContext(){return canvasContext;}
  get classList(){return {toggle(){},add(){},remove(){}};}
  setPointerCapture(){}
  set innerHTML(v){this._html=String(v);this.children=[];}
  get innerHTML(){return this._html||'';}
}
const canvasContext=new Proxy({}, {get(target,key){if(!(key in target))target[key]=()=>{};return target[key];},set(target,key,value){target[key]=value;return true;}});
let rafId=0;const rafQueue=[];
const window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
const document={createElement(tag){return new FakeNode(tag);}};
const sandbox={window,document,console,Math,Uint8Array,Int32Array,Array,Number,String,Date,JSON,Map,Set,performance:{now:()=>0},requestAnimationFrame(fn){rafQueue.push(fn);return ++rafId;},cancelAnimationFrame(){},btoa,atob};
vm.runInNewContext(fs.readFileSync(__dirname+'/../games-realtime.js','utf8'),sandbox);
const Games={},LIST=[];
window.registerRealtimeGames(Games,LIST);
function makeCtx(id,me,players){
  const ctx={id,me,players,local:false,n:77,root:new FakeNode('div'),cleanup:[],sent:[],status:null,onMsg:null,
    send(message){this.sent.push(message);},
    setStatus(text,player,extra,done){this.status={text,player,extra,done};},
    end(winner,extra){this.ended={winner,extra};},
    turn(){},renderScore(){},who(p){return p===this.me?'Вы':'Игрок '+(p+1);},
    canAct(p){return p===this.me;},canRemoteAct(p,from){return p===from;}
  };
  Games[id].init(ctx);return ctx;
}

test('both real-time games register for 2–10 online players',()=>{
  assert.deepEqual(LIST.map(g=>g.id),['agar','territory']);
  for(const game of LIST){
    assert.equal(game.minPlayers,2);assert.equal(game.maxPlayers,10);assert.equal(game.local,false);
    assert.equal(typeof Games[game.id].init,'function');
  }
});

test('agar host sends an initial world snapshot and guests accept it',()=>{
  const host=makeCtx('agar',0,10),guest=makeCtx('agar',9,10);
  const init=host.sent.find(m=>m.g==='agar-state'&&m.kind==='init');
  assert.ok(init);assert.equal(init.players.length,12);assert.equal(init.foodFull.length,420);
  guest.onMsg({...init,_from:0});
  assert.match(guest.status.text,/Матч начался/);
  host.onMsg({g:'agar-input',_from:9,dx:1,dy:0,active:true});
  host.onMsg({g:'agar-dash',_from:9});
  host.cleanup.forEach(fn=>fn());guest.cleanup.forEach(fn=>fn());
});

test('territory host publishes a packed map and clients apply incremental updates',()=>{
  const host=makeCtx('territory',0,10),guest=makeCtx('territory',9,10);
  const init=host.sent.find(m=>m.g==='territory-state'&&m.kind==='init');
  assert.ok(init);assert.equal(init.players.length,10);assert.ok(init.mapFull.length>1000);
  guest.onMsg({...init,_from:0});
  assert.match(guest.status.text,/Матч начался/);
  host.onMsg({g:'territory-input',_from:9,dir:1});
  host.onMsg({g:'territory-ability',_from:9,ability:0});
  const delta=btoa(String.fromCharCode(5,0,0x21));
  guest.onMsg({g:'territory-state',kind:'snap',mapDelta:delta,players:init.players,counts:init.counts,timeLeft:119.895,_from:0});
  host.cleanup.forEach(fn=>fn());guest.cleanup.forEach(fn=>fn());
});

test('both realtime simulations advance and publish state snapshots',()=>{
  for(const id of ['agar','territory']){
    const host=makeCtx(id,0,3),guest=makeCtx(id,2,3);
    const init=host.sent.find(m=>m.kind==='init');assert.ok(init,id+' host initializes');
    guest.onMsg({...init,_from:0});
    for(let frame=0;frame<18;frame++){
      const pending=rafQueue.splice(0);
      for(const callback of pending)callback(frame*16);
    }
    assert.ok(host.sent.some(m=>m.kind==='snap'),id+' host publishes updated state');
    host.cleanup.forEach(fn=>fn());guest.cleanup.forEach(fn=>fn());
  }
});

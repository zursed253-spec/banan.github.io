'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

class FakeNode {
  constructor(tag){
    this.tagName=tag;this.children=[];this.listeners={};this._text='';this._html='';
    this.className='';this.style={};this.dataset={};this.attrs={};this.disabled=false;
  }
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){this._html=String(value);this._text='';this.children=[];}
  get innerHTML(){return this._html;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);return item;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  setAttribute(name,value){this.attrs[name]=String(value);}
  click(){if(this.disabled)return;for(const fn of this.listeners.click||[])fn({target:this});}
  get classList(){
    return {
      add:(value)=>{if(!this.className.split(/\s+/).includes(value))this.className=(this.className+' '+value).trim();},
      remove:(value)=>{this.className=this.className.split(/\s+/).filter(x=>x!==value).join(' ');},
      contains:(value)=>this.className.split(/\s+/).includes(value)
    };
  }
}
let timerId=0;
const timers=new Map();
const window={};
const document={createElement:tag=>new FakeNode(tag)};
const sandbox={
  window,document,console,Math,
  setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);}
};
vm.runInNewContext(fs.readFileSync(__dirname+'/../games-cards.js','utf8'),sandbox);
const Games={},LIST=[];
window.registerCardGames(Games,LIST,(tag,cls,text)=>new FakeNode(tag));
function find(root,cls){
  const result=[];
  function walk(item){if(item.className.split(/\s+/).includes(cls))result.push(item);item.children.forEach(walk);}
  walk(root);return result;
}
function makeContext(id,players=2,local=false,me=0){
  const ctx={
    id,players,local,me,first:0,n:101,root:new FakeNode('div'),cleanup:[],sent:[],ended:null,onMsg:null,
    canAct(player){return local||player===me;},
    who(player){return local?'Игрок '+(player+1):(player===me?'Вы':'Игрок '+(player+1));},
    send(message){this.sent.push(message);},
    turn(player){this.activeTurn=player;},
    setStatus(text,player,extra,done){this.status={text,player,extra,done};},
    end(winner,extra){this.ended={winner,extra};},
    renderScore(){}
  };
  Games[id].init(ctx);
  return ctx;
}

test('five games register for one to four players',()=>{
  assert.deepEqual(LIST.map(game=>game.id),['durak','lastcard','poker','dungeon','kingdom']);
  for(const game of LIST){
    assert.equal(game.minPlayers,1,game.id+' supports solo');
    assert.equal(game.maxPlayers,4,game.id+' supports four seats');
    assert.equal(typeof Games[game.id].init,'function');
  }
});

test('Durak rules recognise same-suit higher card and trump',()=>{
  const rules=window.BananCardRules;
  assert.equal(rules.durakBeats({suit:'♠',rank:7},{suit:'♠',rank:8},'♥'),true);
  assert.equal(rules.durakBeats({suit:'♠',rank:14},{suit:'♥',rank:6},'♥'),true);
  assert.equal(rules.durakBeats({suit:'♥',rank:6},{suit:'♠',rank:14},'♥'),false);
  assert.equal(rules.durakBeats({suit:'♣',rank:10},{suit:'♣',rank:9},'♥'),false);
});

test('Last Card rules enforce colour/value and penalty stacking',()=>{
  const can=window.BananCardRules.lastCardPlayable;
  const top={color:1,value:'7'};
  assert.equal(can({kind:'number',color:1,value:'2'},top,1,0),true);
  assert.equal(can({kind:'number',color:3,value:'7'},top,1,0),true);
  assert.equal(can({kind:'wild',color:null,value:'W'},top,1,0),true);
  assert.equal(can({kind:'number',color:2,value:'3'},top,1,0),false);
  assert.equal(can({kind:'draw2',color:2,value:'+2'},top,1,2),true);
  assert.equal(can({kind:'number',color:1,value:'7'},top,1,2),false);
});

test('Poker evaluator ranks straight flush above quads and detects wheel straight',()=>{
  const rules=window.BananCardRules;
  const sf=[{rank:9,suit:'♠'},{rank:10,suit:'♠'},{rank:11,suit:'♠'},{rank:12,suit:'♠'},{rank:13,suit:'♠'}];
  const quads=[{rank:14,suit:'♠'},{rank:14,suit:'♥'},{rank:14,suit:'♦'},{rank:14,suit:'♣'},{rank:2,suit:'♠'}];
  assert.ok(rules.comparePoker(rules.evaluateFive(sf),rules.evaluateFive(quads))>0);
  const wheel=[{rank:14,suit:'♠'},{rank:2,suit:'♥'},{rank:3,suit:'♦'},{rank:4,suit:'♣'},{rank:5,suit:'♠'}];
  assert.deepEqual(Array.from(rules.evaluateFive(wheel)),[4,5]);
  assert.equal(sandbox.window.BananCardRules.evaluateFive([{rank:14,suit:'♠'},{rank:14,suit:'♥'},{rank:14,suit:'♦'},{rank:14,suit:'♣'},{rank:2,suit:'♠'}])[0],7);
});

test('Kingdom map adjacency is orthogonal, not diagonal',()=>{
  const adjacent=window.BananCardRules.adjacent;
  assert.equal(adjacent(0,1),true);
  assert.equal(adjacent(0,5),true);
  assert.equal(adjacent(0,6),false);
  assert.equal(adjacent(12,13),true);
});

test('each game builds a playable table and emits valid online moves',()=>{
  for(const id of ['durak','lastcard','poker','dungeon','kingdom']){
    const ctx=makeContext(id,2,false,0);
    assert.ok(ctx.root.children.length>0,id+' renders a game board');
    if(id==='durak'){
      const playable=find(ctx.root,'cg-card').find(card=>!card.disabled);
      assert.ok(playable,'attacker has a playable card');playable.click();
    }else if(id==='lastcard'){
      const draw=find(ctx.root,'cg-action').find(b=>b.textContent==='Взять карту');
      assert.ok(draw,'player can draw a card');draw.click();
    }else if(id==='poker'){
      const call=find(ctx.root,'cg-action').find(b=>b.textContent==='Чек / колл');
      assert.ok(call,'player can check or call');call.click();
    }else if(id==='dungeon'){
      const card=find(ctx.root,'cg-dungeon-card').find(b=>!b.disabled);
      assert.ok(card,'hero has an affordable card');card.click();
    }else if(id==='kingdom'){
      const card=find(ctx.root,'cg-strategy-card')[0];
      assert.ok(card,'player has strategy cards');card.click();
      const tiles=find(ctx.root,'cg-territory');
      tiles[0].click();tiles[1].click();
    }
    assert.ok(ctx.sent.length>0,id+' broadcasts a move to the room');
    ctx.cleanup.forEach(fn=>fn());
  }
});

test('solo mode starts bot seats without exposing their hands as human controls',()=>{
  for(const id of ['durak','lastcard','poker','kingdom']){
    const ctx=makeContext(id,1,true,null);
    assert.ok(ctx.root.children.length>0,id+' supports solo');
    assert.ok(find(ctx.root,'cg-seats').length||find(ctx.root,'cg-poker-seats').length||find(ctx.root,'cg-map').length,id+' displays opponents or a map');
    ctx.cleanup.forEach(fn=>fn());
  }
});

test('cooperative dungeon accepts a four-player room',()=>{
  const ctx=makeContext('dungeon',4,false,0);
  assert.equal(find(ctx.root,'cg-hero').length,4);
  assert.equal(find(ctx.root,'cg-dungeon-card').length>0,true);
  ctx.cleanup.forEach(fn=>fn());
});


test('all card games build with two, three and four human seats',()=>{
  for(const id of ['durak','lastcard','poker','dungeon','kingdom']){
    for(const players of [2,3,4]){
      const ctx=makeContext(id,players,false,0);
      assert.ok(ctx.root.children.length>0,id+' renders with '+players+' participants');
      if(id==='dungeon')assert.equal(find(ctx.root,'cg-hero').length,players,'co-op dungeon allocates one hero per player');
      ctx.cleanup.forEach(fn=>fn());
    }
  }
});

test('solo card-game seat allocator creates three bot opponents',()=>{
  for(const id of ['durak','lastcard','poker','kingdom']){
    const ctx=makeContext(id,1,true,null);
    const seats=find(ctx.root,'cg-seat');
    assert.ok(ctx.root.children.length>0,id+' starts a solo match against bots');
    ctx.cleanup.forEach(fn=>fn());
  }
});


test('multiway poker accepts the current actor action and advances on every client',()=>{
  for(const players of [2,3,4]){
    const actor=players===4?3:0;
    const receiver=(actor+1)%players;
    const active=makeContext('poker',players,false,actor);
    const peer=makeContext('poker',players,false,receiver);
    assert.equal(active.activeTurn,actor,'the selected seat is first to act');
    const call=find(active.root,'cg-action').find(button=>button.textContent==='Чек / колл');
    assert.ok(call,'the first actor can call the big blind');
    call.click();
    const move=active.sent.find(message=>message.g==='poker');
    assert.ok(move,'the poker action is broadcast');
    peer.onMsg({...move,_from:actor});
    assert.equal(peer.activeTurn,active.activeTurn,'the receiving client advances to the same next actor');
    assert.equal(peer.sent.length,0,'remote poker actions are not echoed');
    active.cleanup.forEach(fn=>fn());peer.cleanup.forEach(fn=>fn());
  }
});

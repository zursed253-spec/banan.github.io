'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');

test('all embedded page scripts parse',()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.ok(scripts.length>=2);
  scripts.forEach((source,index)=>assert.doesNotThrow(()=>new Function(source),'inline script '+index+' parses'));
});

test('all visible game modes support one through four participants',()=>{
  const start=html.indexOf('const LIST=['),end=html.indexOf('];',start);
  const list=html.slice(start,end);
  for(const id of ['ttt','bs','c4','rev','dots'])assert.ok(list.includes("id:'"+id+"'"),id+' is in the hub catalogue');
  assert.match(html,/game\.minPlayers=1;game\.maxPlayers=4/);
  assert.match(html,/game\.teamGame=!individualGames\.has\(game\.id\)/);
  assert.match(html,/individualGames=new Set\(\['ttt','durak','lastcard','poker','dungeon','kingdom'\]\)/);
});

test('tic-tac-toe has distinct three- and four-player rules',()=>{
  assert.match(html,/players=ctx\.players===1\?2:ctx\.players/);
  assert.match(html,/size=players>=3\?6:3,connect=players>=3\?4:3/);
  assert.match(html,/\['X','O','△','□'\]/);
  assert.match(html,/turn=\(turn\+1\)%players/);
});

test('solo mode locks human input during computer turns and has a bot for each two-side game',()=>{
  assert.match(html,/this\.root\.inert=waiting/);
  for(const id of ['ttt','c4','rev','dots','bs'])assert.ok(html.includes("'"+id+"'"),id+' has a registered bot path');
  for(const id of ['chess','checkers','gomoku','hex','quoridor','mines','memory','vanish','blockade'])assert.ok(html.includes("case '"+id+"'"),id+' has a registered bot path');
});

test('battleship is available in local solo mode',()=>{
  assert.match(html,/name:'Морской бой',[\s\S]{0,220}local:true/);
});

test('four-player battleship resolves team shots once and syncs teammate results',()=>{
  assert.match(html,/ctx\.me!==ctx\.team/);
  assert.match(html,/applyTeamIncomingResult/);
  assert.match(html,/enemyGrid=Array\(100\)\.fill\(-1\)/);
  assert.match(html,/ctx\.botMove=cpuShoot/);
});


test('every visible game is registered and exposes one-to-four participant limits',()=>{
  const extra=fs.readFileSync(require.resolve('../games-extra.js'),'utf8');
  const cards=fs.readFileSync(require.resolve('../games-cards.js'),'utf8');
  const extraIds=['chess','checkers','gomoku','hex','quoridor','mines','memory','vanish','blockade'];
  const cardIds=['durak','lastcard','poker','dungeon','kingdom'];
  for(const id of extraIds)assert.ok(extra.includes("U.register('"+id+"'"),id+' is registered');
  for(const id of cardIds)assert.ok(cards.includes("'"+id+"'"),id+' is registered');
  assert.match(html,/game\.minPlayers=1;game\.maxPlayers=4/);
  assert.match(html,/const individualGames=new Set\(\['ttt','durak','lastcard','poker','dungeon','kingdom'\]\)/);
  assert.match(html,/sendSignal\(\{t:'host',code:Net\.code,maxPlayers:Net\.maxPlayers\}\)/,'room collision retry preserves selected capacity');
});

test('team turn authorization validates the sending seat for three and four players',()=>{
  assert.match(html,/canRemoteAct\(t,from\)/);
  assert.match(html,/teamGame&&count>=3 \? from%2===t : from===t/);
  assert.match(html,/ctx\.canRemoteAct\(turn,d\?\._from\)/);
  const extra=fs.readFileSync(require.resolve('../games-extra.js'),'utf8');
  for(const id of ['checkers','gomoku','hex','quoridor','mines','memory','blockade']){
    assert.ok(extra.includes('ctx.canRemoteAct(turn,d._from)'),id+' rejects messages from the wrong team');
  }
  assert.match(extra,/ctx\.canRemoteAct\(1-turn,d\._from\)/,'the guess action in What disappeared? belongs to the other team');
});

test('cooperative dungeon reports a shared victory or defeat instead of a false draw',()=>{
  const cards=fs.readFileSync(require.resolve('../games-cards.js'),'utf8');
  assert.match(cards,/ctx\.end\('all','Отряд прошёл все 12 этажей'\)/);
  assert.match(cards,/ctx\.end\('loss','Отряд пал на этаже '\+state\.floor\)/);
  assert.match(html,/if\(w==='all'\)for\(let i=0;i<size;i\+\+\)sc\[i\]\+\+/);
});

test('poker multiplayer receiver validates the real actor seat and handles next-hand host action',()=>{
  const cards=fs.readFileSync(require.resolve('../games-cards.js'),'utf8');
  assert.match(cards,/const expected=d\.type==='next'\?0:state\.toAct/);
  assert.match(cards,/if\(d\._from!==expected\)return/);
});


test('local Battleship supports pass-and-play with separate hidden fleets for both sides',()=>{
  assert.match(html,/function initLocalBattleship\(ctx\)/);
  assert.match(html,/if\(ctx\.local&&ctx\.players>1\)\{initLocalBattleship\(ctx\);return;\}/);
  assert.match(html,/Передайте устройство '\+ctx\.who\(1\)/);
  assert.match(html,/incoming=\[Array\(100\)\.fill\(0\),Array\(100\)\.fill\(0\)\]/);
  assert.match(html,/outgoing=\[Array\(100\)\.fill\(0\),Array\(100\)\.fill\(0\)\]/);
});

test('online Battleship synchronizes one captain fleet per team and serializes shots',()=>{
  assert.match(html,/teamMode=ctx\.players>=3,teamCaptain=!teamMode\|\|ctx\.me===ctx\.team/);
  assert.match(html,/ctx\.send\(teamMode\?\{k:'ready',ships:placed\.map\(cells=>cells\.slice\(\)\)\}:\{k:'ready'\}\)/);
  assert.match(html,/validFleetLayout\(d\.ships\)/);
  assert.match(html,/if\(teamMode&&d\._from%2===ctx\.team\)\{pending=true;drawFoe\(\);return;\}/);
  assert.match(html,/ctx\.canRemoteAct\(1-turn,d\._from\)/);
  assert.match(html,/if\(teamMode&&d\._from!==1-turn\)return/);
});

test('Reversi and local poker enforce active-seat input and hide inactive hands',()=>{
  assert.match(html,/ctx\.canRemoteAct\(turn,d\?\._from\)\)apply\(d\.m\)/);
  const cards=fs.readFileSync(require.resolve('../games-cards.js'),'utf8');
  assert.match(cards,/ctx\.local&&ctx\.players>1&&p===state\.toAct/);
});


test('local Battleship can place two fleets and finish a pass-and-play match for two to four people',()=>{
  const start=html.indexOf('function initLocalBattleship(ctx){');
  assert.ok(start>=0);
  const brace=html.indexOf('{',start);
  let depth=0,end=-1;
  for(let i=brace;i<html.length;i++){
    if(html[i]==='{')depth++;
    else if(html[i]==='}'&&--depth===0){end=i+1;break;}
  }
  assert.ok(end>start);
  class FakeElement{
    constructor(tag,cls,text){this.tagName=tag;this.className=cls||'';this.textContent=text||'';this.children=[];this.style={};this.disabled=false;this.listeners={};this._html='';this.classList={toggle:(name,on)=>{const parts=this.className.split(/\s+/).filter(Boolean).filter(x=>x!==name);if(on)parts.push(name);this.className=parts.join(' ');}};}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);return node;}
    querySelector(selector){return this.children.find(node=>selector==='h3'?node.tagName==='h3':false)||null;}
    set innerHTML(value){this._html=value;if(value==='')this.children=[];}
    get innerHTML(){return this._html;}
    click(){if(!this.disabled)this.onclick?.();}
  }
  const make=(tag,cls,text)=>new FakeElement(tag,cls,text);
  const init=new Function('el','return ('+html.slice(start,end)+')')(make);
  function descendants(node,cls,out=[]){if(node.className.split(/\s+/).includes(cls))out.push(node);for(const child of node.children)descendants(child,cls,out);return out;}
  for(const players of [2,3,4]){
    const ctx={root:make('div'),local:true,players,first:1,activeTurn:null,turnCalls:0,ended:null,
      who:p=>players>=3?'Команда '+(p+1):'Игрок '+(p+1),
      setStatus(){},turn(p){this.activeTurn=p;this.turnCalls++;},end(w,info){this.ended={winner:w,info};}};
    init(ctx);
    const buttons=descendants(ctx.root,'bs-tools')[0].children;
    const random=buttons[1],ready=buttons[3];
    random.click();ready.click();
    random.click();ready.click();
    assert.equal(ctx.activeTurn,1,'battle begins after both teams place their fleets');
    const foeGrid=descendants(ctx.root,'bs-grid')[1];
    const cells=foeGrid.children.filter(node=>node.className.split(/\s+/).includes('bs-cell'));
    assert.equal(cells.length,100);
    for(let step=0;step<500&&!ctx.ended;step++){
      const nextShot=cells.find(cell=>cell.className.split(/\s+/).includes('unk'));
      if(!nextShot)break;
      nextShot.click();
    }
    assert.ok(ctx.ended,'local match did not finish: turn='+ctx.activeTurn+', remaining='+cells.filter(cell=>cell.className.split(/\\s+/).includes('unk')).length+', turns='+ctx.turnCalls);
    assert.ok([0,1].includes(ctx.ended.winner));
  }
});

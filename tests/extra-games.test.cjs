const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this._text='';this._html='';this.className='';this.style={};this.attrs={};this.dataset={};this.disabled=false;}
  set textContent(s){this._text=String(s);this.children=[];}
  get textContent(){return this._text + this.children.map(x=>x.textContent).join('');}
  set innerHTML(s){this._html=String(s);this.children=[];this._text='';}
  get innerHTML(){return this._html;}
  append(...xs){this.children.push(...xs);}
  appendChild(x){this.children.push(x);return x;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(event,cb){(this.listeners[event]??=[]).push(cb);}
  click(){for(let cb of this.listeners.click||[])cb();}
  get classList(){return {add:c=>{this.className+=' '+c;},toggle:(c,on)=>{if(on && !this.className.split(' ').includes(c))this.className+=' '+c;}}}
}
const window={addEventListener(){},removeEventListener(){}};
let timerId=0;
const intervals=new Map(),timeouts=new Map();
function fakeSetInterval(fn,delay){const id=++timerId;intervals.set(id,{fn,delay});return id;}
function fakeClearInterval(id){intervals.delete(id);}
function fakeSetTimeout(fn,delay){const id=++timerId;timeouts.set(id,{fn,delay});return id;}
function fakeClearTimeout(id){timeouts.delete(id);}
function tickIntervals(count=1){
  for(let i=0;i<count;i++){
    for(const [id,timer] of [...intervals])if(intervals.has(id))timer.fn();
  }
}
function runTimeouts(delay){
  const pending=[...timeouts].filter(([,timer])=>delay===undefined||timer.delay===delay);
  for(const [id,timer] of pending){timeouts.delete(id);timer.fn();}
}
const sandbox={window,document:{createElement:x=>new Node(x),createElementNS:(ns,x)=>new Node(x)},Image:class extends Node{constructor(){super('img')}},console,setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout,setInterval:fakeSetInterval,clearInterval:fakeClearInterval,Math};
vm.runInNewContext(fs.readFileSync(__dirname+'/../games-extra.js','utf8'),sandbox);
const games={},list=[];
window.registerExtraGames(games,list);
assert.equal(list.length,10);
const source=fs.readFileSync(__dirname+'/../games-extra.js','utf8');
const poolStart=source.indexOf('const MEME_POOL = ')+'const MEME_POOL = '.length;
const poolEnd=source.indexOf('];',poolStart)+1;
const memePool=JSON.parse(source.slice(poolStart,poolEnd));
assert.equal(memePool.length,36,'the game pool contains all 36 meme images');
function ctx(game,n,first,me,local=false){
  const out={sent:[],ended:undefined,log:[],...{id:game,first,n,local,me,pov:me??0,role:me,root:new Node('div'),cleanup:[],onMsg:null},
  canAct(turn){return local||this.me===turn},
  who(p){return local?'Игрок '+(p+1):(p===this.me?'Вы':'Соперник')},
  send(m){this.sent.push(m)},
  setStatus(text,player,extra){this.log.push(['status',text,player,extra]);},
  turn(turn,extra){this.log.push(['turn',turn,extra]);},
  end(win,extra){this.ended=[win,extra];this.log.push(['end',win,extra]);}}
  games[game].init(out);return out;
}
function find(root,cls){const arr=[];function visit(n){if(n.className.split(' ').includes(cls))arr.push(n);for(const ch of n.children)visit(ch);}visit(root);return arr;}
function play(game,actions){
 const a=ctx(game,42,0,0), b=ctx(game,42,0,1);
 actions(a);
 assert.ok(a.sent.length>0, game+' has sent action');
 const seq=a.sent.slice();for(const msg of seq)b.onMsg(msg);
 assert.equal(b.sent.length,0,game+' remote sent no echo');
 assert.deepEqual(a.log[a.log.length-1][0],b.log[b.log.length-1][0],game+' status kind');
 console.log('PASS',game,'sent',JSON.stringify(seq));
 a.cleanup.forEach(fn=>fn());b.cleanup.forEach(fn=>fn());
}
function testVanishOnline(){
 const picker=ctx('vanish',42,0,0),guesser=ctx('vanish',42,0,1);
 const start=picker.sent.find(m=>m.k==='vanish-start');
 assert.ok(start,'picker starts the round and broadcasts it');
 guesser.onMsg(start);
 tickIntervals(7);
 const pickerItems=find(picker.root,'x-vanish-item');
 const guesserItems=find(guesser.root,'x-vanish-item');
 assert.equal(pickerItems.length,10,'ten objects are placed on the table');
 assert.equal(guesserItems.length,10,'both players receive the same ten objects');
 assert.equal(pickerItems.filter(x=>x.className.includes('selectable')).length,10,'only the picker can select an object');
 assert.equal(guesserItems.filter(x=>x.className.includes('selectable')).length,0,'the guesser cannot select the object to remove');

 // The shuffled layout must keep every card fully visible; even its rotated bounds do not overlap.
 const rects=pickerItems.map(node=>{
   const size=Number(node.dataset.size),angle=Math.abs(Number(node.dataset.rot))*Math.PI/180;
   const extent=size*(Math.cos(angle)+Math.sin(angle));
   return {left:Number(node.dataset.left),top:Number(node.dataset.top)*430/900,extent};
 });
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
   const a=rects[i],b=rects[j];
   const overlapX=Math.min(a.left+a.extent,b.left+b.extent)-Math.max(a.left,b.left);
   const overlapY=Math.min(a.top+a.extent,b.top+b.extent)-Math.max(a.top,b.top);
   assert.ok(overlapX<=0||overlapY<=0,'cards never cover each other; every item remains 100% visible');
 }

 const selected=pickerItems[3];
 selected.click();
 const hide=picker.sent.find(m=>m.k==='vanish-hide');
 assert.equal(hide.id,selected.dataset.itemId,'the chosen table item is the one removed');
 guesser.onMsg(hide);
 const pickerChoices=find(picker.root,'x-vanish-choice');
 const guesserChoices=find(guesser.root,'x-vanish-choice');
 assert.equal(guesserChoices.length,10,'all ten original items are offered as answers');
 assert.ok(guesserChoices.every(x=>!x.disabled),'only the guesser can answer');
 assert.ok(pickerChoices.every(x=>x.disabled),'the picker cannot answer their own round');
 const answer=guesserChoices.find(x=>x.dataset.itemId===selected.dataset.itemId);
 assert.ok(answer,'the removed item is included among the answer options');
 answer.click();
 const guess=guesser.sent.find(m=>m.k==='vanish-guess');
 assert.equal(guess.id,selected.dataset.itemId,'the guess is sent to the picker');
 picker.onMsg(guess);
 assert.match(find(picker.root,'x-hud')[0].textContent,/Игрок 2: 1/,'the point is awarded to the guesser');

 runTimeouts(1600);
 const next=guesser.sent.filter(m=>m.k==='vanish-start').at(-1);
 assert.ok(next&&next.turn===1&&next.round===1,'roles swap on the next round');
 picker.onMsg(next);
 assert.match(find(picker.root,'x-hud')[0].textContent,/Раунд 2 \/ 8/,'the next round starts on both clients');
 picker.cleanup.forEach(fn=>fn());
 guesser.cleanup.forEach(fn=>fn());
 console.log('PASS vanish online: picker chooses, opponent guesses, roles rotate, cards do not overlap');
}
function testVanishLocal(){
 const local=ctx('vanish',43,1,null,true);
 tickIntervals(7);
 const items=find(local.root,'x-vanish-item');
 assert.equal(items.filter(x=>x.className.includes('selectable')).length,10,'local picker can choose an item');
 const selected=items[0];
 selected.click();
 const choices=find(local.root,'x-vanish-choice');
 const answer=choices.find(x=>x.dataset.itemId===selected.dataset.itemId);
 assert.ok(answer,'local round offers the chosen item as a possible answer');
 answer.click();
 assert.match(find(local.root,'x-hud')[0].textContent,/Игрок 1: 1/,'local score goes to the other player who guessed');
 local.cleanup.forEach(fn=>fn());
 console.log('PASS vanish local: players alternate picker and guesser');
}
play('chess',a=>{find(a.root,'x-chess-cell')[52].click();find(a.root,'x-chess-cell')[36].click()});
play('checkers',a=>{find(a.root,'x-check-cell')[40].click();find(a.root,'x-check-cell')[33].click()});
play('gomoku',a=>find(a.root,'x-go-cell')[0].click());
play('hex',a=>find(a.root,'x-hex-tile')[0].click());
play('quoridor',a=>{
  const svg=find(a.root,'x-q-board')[0].children[0];
  const cell=svg.children.find(x=>x.tagName==='rect'&&x.attrs.x==='274'&&x.attrs.y==='475');
  // Use one of the row=7,col=4 squares to move from (8,4).
  assert.ok(cell,'Quoridor cell');cell.click();
});
play('mines',a=>find(a.root,'x-mine-cell')[0].click());
play('memory',a=>find(a.root,'x-memory-cell')[0].click());
play('arena',a=>find(a.root,'arena2-action').find(x=>x.dataset.act==='fence').click());
testVanishOnline();
testVanishLocal();
play('blockade',a=>find(a.root,'x-block-cell')[37].click());
console.log('All game smoke tests passed');
function localChess(steps){
  const c=ctx('chess',78,0,null,true);
  for(const [from,to] of steps){
    find(c.root,'x-chess-cell')[from].click();
    find(c.root,'x-chess-cell')[to].click();
  }
  return c;
}
const mate=localChess([[53,45],[12,28],[54,38],[3,39]]);
assert.equal(mate.ended?.[0],1,'fools mate black win');
const ep=localChess([[52,36],[8,16],[36,28],[11,27],[28,19]]);
assert.equal(find(ep.root,'x-chess-cell')[19].textContent,'♙','en passant pawn landed');
assert.equal(find(ep.root,'x-chess-cell')[27].textContent,'','en passant removed captured pawn');
console.log('Chess checkmate and en passant scenarios passed');


function testChessFeatures(){
  const local=ctx('chess',91,0,null,true);
  const cells=()=>find(local.root,'x-chess-cell');
  const move=(from,to)=>{cells()[from].click();cells()[to].click();};
  move(62,45); // Ng1-f3
  move(6,21);  // Ng8-f6
  move(45,62); // Nf3-g1
  move(21,6);  // Nf6-g8
  move(62,45);
  move(6,21);
  move(45,62);
  move(21,6);
  assert.equal(find(local.root,'x-chess-move-row').length,4,'move history groups plies into numbered rows');
  const claim=find(local.root,'x-chess-claim')[0];
  assert.ok(claim&&!claim.disabled,'threefold repetition can be claimed');
  claim.click();
  assert.match(local.log.at(-1)[2],/Ничья/,'threefold claim ends the game as a draw');
  local.cleanup.forEach(fn=>fn());

  const undoGame=ctx('chess',92,0,null,true);
  const undoCells=()=>find(undoGame.root,'x-chess-cell');
  undoCells()[52].click();undoCells()[36].click();
  assert.equal(undoCells()[36].textContent,'♙','pawn reaches e4');
  find(undoGame.root,'x-chess-undo')[0].click();
  assert.equal(undoCells()[52].textContent,'♙','undo restores the original pawn square');
  assert.equal(undoCells()[36].textContent,'','undo clears the destination');
  assert.equal(find(undoGame.root,'x-chess-move-row').length,0,'undo restores move history');
  undoGame.cleanup.forEach(fn=>fn());

  const castle=ctx('chess',93,0,null,true);
  const castleCells=()=>find(castle.root,'x-chess-cell');
  const castleMove=(from,to)=>{castleCells()[from].click();castleCells()[to].click();};
  castleMove(52,36);castleMove(12,28); // e4, ...e5
  castleMove(62,45);castleMove(1,18);  // Nf3, ...Nc6
  castleMove(61,34);castleMove(6,21);  // Bc4, ...Nf6
  castleMove(60,62);                   // O-O
  assert.equal(castleCells()[62].children.find(x=>x.className.includes('x-chess-piece'))?.textContent,'♔','castling moves the king two squares');
  assert.equal(castleCells()[61].children.find(x=>x.className.includes('x-chess-piece'))?.textContent,'♖','castling also moves the rook');
  assert.match(find(castle.root,'x-chess-move-row').at(-1).textContent,/O-O/,'castling is recorded in algebraic notation');
  castle.cleanup.forEach(fn=>fn());
  console.log('Chess history, threefold draw claim, undo and castling scenarios passed');
}
testChessFeatures();


function testChessVisualsAndPromotion(){
  const view=ctx('chess',105,0,null,true);
  const ranks=find(view.root,'x-chess-ranks')[0],files=find(view.root,'x-chess-files')[0];
  assert.equal(ranks.textContent,'87654321','ranks run from eight to one');
  assert.equal(files.textContent,'abcdefgh','file letters appear outside board');
  const firstPiece=find(view.root,'x-chess-piece')[0];
  assert.equal(firstPiece.children[0].tagName,'svg','chess pieces use SVG instead of device fonts');
  assert.equal(firstPiece.children[0].attrs.viewBox,'0 0 48 48','every SVG has scalable coordinates');
  find(view.root,'x-chess-flip')[0].click();
  assert.equal(ranks.textContent,'12345678','ranks flip with board');
  assert.equal(files.textContent,'hgfedcba','file letters flip with board');
  view.cleanup.forEach(fn=>fn());

  const promotion=ctx('chess',106,0,null,true);
  const squares=()=>find(promotion.root,'x-chess-cell');
  const step=(a,b)=>{squares()[a].click();squares()[b].click();};
  step(48,32); // a4
  step(8,24);  // ...a5
  step(49,33); // b4
  step(24,33); // ...axb4
  step(32,24); // a5
  step(9,17);  // ...b6
  step(24,17); // axb6
  step(14,22); // ...g6
  step(17,9);  // b7
  step(13,21); // ...f6
  step(9,0);   // bxa8=?
  const buttons=find(promotion.root,'x-promo-btn');
  assert.equal(buttons.length,4,'promotion offers queen, rook, bishop and knight');
  buttons[0].click();
  assert.equal(squares()[0].children.find(x=>x.className.includes('x-chess-piece'))?.textContent,'♕',
    'selected queen is placed on promotion square');
  assert.equal(find(promotion.root,'x-promo-btn').length,0,'promotion picker closes after move');
  assert.match(find(promotion.root,'x-chess-move-row').at(-1).textContent,/=Q/,'promotion is recorded in SAN history');
  promotion.cleanup.forEach(fn=>fn());
  console.log('Chess SVG pieces, axis labels, board flip, and promotion passed');
}
testChessVisualsAndPromotion();

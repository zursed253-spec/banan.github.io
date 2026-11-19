const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this._text='';this.className='';this.style={};this.attrs={};this.dataset={};this.disabled=false;}
  set textContent(s){this._text=String(s);this.children=[];}
  get textContent(){return this._text + this.children.map(x=>x.textContent).join('');}
  append(...xs){this.children.push(...xs);}
  appendChild(x){this.children.push(x);return x;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(event,cb){(this.listeners[event]??=[]).push(cb);}
  click(){for(let cb of this.listeners.click||[])cb();}
  get classList(){return {add:c=>{this.className+=' '+c;},toggle:(c,on)=>{if(on && !this.className.split(' ').includes(c))this.className+=' '+c;}}}
}
const window={addEventListener(){},removeEventListener(){}};
const sandbox={window,document:{createElement:x=>new Node(x),createElementNS:(ns,x)=>new Node(x)},Image:class extends Node{constructor(){super('img')}},console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},Math};
vm.runInNewContext(fs.readFileSync(__dirname+'/../games-extra.js','utf8'),sandbox);
const games={},list=[];
window.registerExtraGames(games,list);
assert.equal(list.length,10);
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
play('vanish',a=>find(a.root,'x-tools')[0].children[0].click());
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

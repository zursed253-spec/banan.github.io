/* Five replayable card and strategy games for 1–4 players. */
(function () {
  'use strict';

  const SUITS = ['♠','♥','♦','♣'];
  const COLORS = ['#26384d','#b43b3b','#b43b3b','#26384d'];
  const PALETTE = ['#355f91','#c04c45','#4d8159','#c18b35'];
  const RANKS = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const node = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined && value !== null) e.textContent = String(value);
    return e;
  };
  const button = (parent, cls, value, fn, disabled) => {
    const b = node('button', cls, value);
    b.type = 'button';
    b.disabled = !!disabled;
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  };
  const shuffle = (items, seed) => {
    const a = items.slice();
    let x = (seed | 0) || 1;
    const random = () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const rng = seed => {
    let x = (seed | 0) || 1;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  };
  const seedOf = ctx => (((ctx.n || 1) * 104729) ^ ((ctx.first || 0) * 8191) ^ 0x51f15e) | 0;
  const seats = (ctx, fillSolo) => {
    const humans = Math.max(1, Math.min(4, Number(ctx.players) || 2));
    const total = fillSolo && humans === 1 ? 4 : humans;
    return { humans, total, bots: new Set(Array.from({length: total}, (_,i)=>i).filter(i=>i>=humans)) };
  };
  const canControl = (ctx, bots, player) => !bots.has(player) && ctx.canAct(player);
  const playerName = (ctx, bots, player) => bots.has(player) ? 'Бот '+(player+1) : ctx.who(player);
  const cardRoot = (ctx, title, description, className) => {
    const root = ctx.root;
    root.innerHTML = '';
    const wrap = node('div', 'cg-wrap '+(className||''));
    const intro = node('div', 'cg-intro');
    intro.append(node('h2','cg-heading',title),node('p','cg-description',description));
    const hud = node('div','cg-hud');
    const table = node('div','cg-table');
    const controls = node('div','cg-controls');
    const hand = node('div','cg-hand');
    wrap.append(intro,hud,table,controls,hand);
    root.appendChild(wrap);
    return {wrap,hud,table,controls,hand};
  };
  const playingCard = (card, onClick, disabled, hidden) => {
    const b = node('button','cg-card'+(hidden?' cg-card-back':'')+(disabled?' cg-card-disabled':''));
    b.type = 'button'; b.disabled = !!disabled;
    if (hidden) {
      b.append(node('span','cg-card-backmark','✦'));
    } else {
      const red = card.suit === '♥' || card.suit === '♦';
      b.classList.add(red?'red':'black');
      b.append(node('span','cg-card-rank',RANKS[card.rank]||String(card.rank)),node('span','cg-card-suit',card.suit),node('span','cg-card-corner',RANKS[card.rank]||String(card.rank)));
    }
    if (onClick) b.addEventListener('click',onClick);
    return b;
  };
  const cardLabel = c => (RANKS[c.rank]||String(c.rank))+c.suit;
  const register = (Games, LIST, id, name, desc, minPlayers, maxPlayers, icon, init) => {
    LIST.push({id,name,desc,online:true,local:true,minPlayers,maxPlayers,icon});
    Games[id] = {init};
  };
  const nextSeat = (from, count, direction, predicate) => {
    for (let step=1;step<=count;step++) {
      const p=(from+direction*step%count+count*2)%count;
      if (!predicate || predicate(p)) return p;
    }
    return -1;
  };
  const suitRank = c => c.rank;
  const beats = (attack, defense, trump) =>
    (defense.suit===attack.suit && defense.rank>attack.rank) ||
    (defense.suit===trump && attack.suit!==trump);

  function initDurak(ctx) {
    const cfg=seats(ctx,true),N=cfg.total,bots=cfg.bots;
    const ui=cardRoot(ctx,'Дурак','Классическая колода на 36 карт. Бейте карты, подкидывайте по рангу и не оставайтесь последним с картами.','cg-durak');
    const state={deck:[],hands:Array.from({length:N},()=>[]),discard:[],table:[],trump:'',attacker:0,defender:1,turn:0,phase:'attack',winner:null,out:[]};
    let seq=0,botTimer=null,ended=false;
    const clearBot=()=>{if(botTimer!==null){clearTimeout(botTimer);botTimer=null;}};
    ctx.cleanup.push(clearBot);
    function freshDeck(){return shuffle(SUITS.flatMap(suit=>Array.from({length:9},(_,i)=>({id:suit+String(i+6),suit,rank:i+6}))),seedOf(ctx));}
    function nextPlayer(p){return nextSeat(p,N,1,i=>state.deck.length>0||state.hands[i].length>0);}
    function finish(winner,reason){
      if(ended)return;ended=true;clearBot();state.winner=winner;
      render();
      if(winner===null)ctx.end(null,reason);
      else ctx.end(winner,reason);
    }
    function checkEnd(){
      if(state.deck.length)return false;
      const active=state.hands.map((h,i)=>h.length?i:-1).filter(i=>i>=0);
      if(active.length<=1){
        const winner=active.length===0?null:(state.out.length?state.out[0]:(active[0]+1)%N);
        finish(winner,active.length?'Последний с картами: '+playerName(ctx,bots,active[0]):'Все карты закончились');
        return true;
      }
      return false;
    }
    function drawToSix(first){
      const order=[];
      for(let k=0;k<N;k++)order.push((first+k)%N);
      for(const p of order)while(state.hands[p].length<6&&state.deck.length)state.hands[p].push(state.deck.pop());
      if(!state.deck.length)state.hands.forEach((h,i)=>{if(!h.length&&!state.out.includes(i))state.out.push(i);});
    }
    function validAttack(card){
      if(state.table.length>=6)return false;
      if(!state.table.length)return true;
      return state.table.some(pair=>pair.attack.rank===card.rank||(pair.defense&&pair.defense.rank===card.rank));
    }
    function firstOpen(){return state.table.findIndex(pair=>!pair.defense);}
    function closeRound(took){
      if(took){
        state.table.forEach(pair=>{state.hands[state.defender].push(pair.attack);if(pair.defense)state.hands[state.defender].push(pair.defense);});
      }else{
        state.table.forEach(pair=>{state.discard.push(pair.attack);if(pair.defense)state.discard.push(pair.defense);});
      }
      const oldAttacker=state.attacker,oldDefender=state.defender;
      drawToSix(oldAttacker);
      if(checkEnd())return;
      state.attacker=took?nextPlayer(oldDefender):oldDefender;
      if(state.attacker<0)state.attacker=oldAttacker;
      state.defender=nextPlayer(state.attacker);
      if(state.defender<0)state.defender=state.attacker;
      state.turn=state.attacker;state.phase='attack';state.table=[];
      render();scheduleBot();
    }
    function apply(a){
      if(ended||!a||typeof a.type!=='string')return false;
      if(a.type==='attack'){
        if(state.phase!=='attack'||state.turn!==state.attacker||!Number.isInteger(a.index))return false;
        const c=state.hands[state.turn][a.index];if(!c||!validAttack(c))return false;
        state.hands[state.turn].splice(a.index,1);state.table.push({attack:c,defense:null});return true;
      }
      if(a.type==='endAttack'){
        if(state.phase!=='attack'||state.turn!==state.attacker||!state.table.length)return false;
        state.phase='defend';state.turn=state.defender;return true;
      }
      if(a.type==='defend'){
        if(state.phase!=='defend'||state.turn!==state.defender||!Number.isInteger(a.index))return false;
        const open=firstOpen(),c=state.hands[state.turn][a.index];
        if(open<0||!c||!beats(state.table[open].attack,c,state.trump))return false;
        state.hands[state.turn].splice(a.index,1);state.table[open].defense=c;return true;
      }
      if(a.type==='take'){
        if(state.phase!=='defend'||state.turn!==state.defender||firstOpen()<0)return false;
        closeRound(true);return true;
      }
      if(a.type==='beat'){
        if(state.phase!=='defend'||state.turn!==state.defender||firstOpen()>=0)return false;
        closeRound(false);return true;
      }
      return false;
    }
    function commit(a,remote){
      if(!apply(a))return false;
      if(!remote){seq++;if(!ctx.local)ctx.send(Object.assign({g:'durak',seq},a));}
      render();scheduleBot();return true;
    }
    function botMove(){
      const p=state.turn;
      if(!bots.has(p)||ended)return;
      if(state.phase==='attack'){
        const choices=state.hands[p].map((c,i)=>({c,i})).filter(x=>validAttack(x.c)).sort((a,b)=>a.c.rank-b.c.rank);
        if(choices.length)commit({type:'attack',index:choices[0].i},false);
        else commit({type:'endAttack'},false);
      }else{
        const open=firstOpen();
        if(open<0)commit({type:'beat'},false);
        else{
          const choices=state.hands[p].map((c,i)=>({c,i})).filter(x=>beats(state.table[open].attack,x.c,state.trump)).sort((a,b)=>(a.c.suit===state.trump?1:0)-(b.c.suit===state.trump?1:0)||a.c.rank-b.c.rank);
          if(choices.length)commit({type:'defend',index:choices[0].i},false);
          else commit({type:'take'},false);
        }
      }
    }
    function scheduleBot(){
      clearBot();
      if(!ended&&bots.has(state.turn))botTimer=setTimeout(()=>{botTimer=null;botMove();},420);
    }
    function render(){
      ui.hud.innerHTML='';
      ui.hud.append(node('span','cg-pill','Колода: '+state.deck.length),node('span','cg-pill','Козырь: '+state.trump),node('span','cg-pill','Атака: '+playerName(ctx,bots,state.attacker)),node('span','cg-pill','Защита: '+playerName(ctx,bots,state.defender)));
      ui.table.innerHTML='';
      const seatsBox=node('div','cg-seats');
      for(let p=0;p<N;p++){
        const seat=node('div','cg-seat'+(p===state.turn?' active':''));
        seat.append(node('b','',playerName(ctx,bots,p)),node('span','',state.hands[p].length+' карт'));
        seatsBox.appendChild(seat);
      }
      const play=node('div','cg-play');
      state.table.forEach(pair=>{
        const stack=node('div','cg-duel');
        stack.append(playingCard(pair.attack,null,true,false));
        if(pair.defense)stack.append(playingCard(pair.defense,null,true,false));
        else stack.append(node('div','cg-empty-card','—'));
        play.appendChild(stack);
      });
      if(!state.table.length)play.append(node('div','cg-empty-table','Стол свободен'));
      ui.table.append(seatsBox,play);
      ui.hand.innerHTML='';
      const active=canControl(ctx,bots,state.turn);
      if(active){
        ui.hand.append(node('h3','cg-subtitle',playerName(ctx,bots,state.turn)+' · ваша рука'));
        const cards=node('div','cg-card-row');
        state.hands[state.turn].forEach((c,i)=>{
          let enabled=false;
          if(state.phase==='attack')enabled=state.turn===state.attacker&&validAttack(c);
          if(state.phase==='defend'){const open=firstOpen();enabled=open>=0&&beats(state.table[open].attack,c,state.trump);}
          cards.appendChild(playingCard(c,()=>commit({type:state.phase==='attack'?'attack':'defend',index:i},false),!enabled,false));
        });
        ui.hand.appendChild(cards);
      }else{
        ui.hand.append(node('div','cg-wait','Ожидаем ход '+playerName(ctx,bots,state.turn)+' · '+state.hands[state.turn].length+' карт'));
      }
      ui.controls.innerHTML='';
      if(active&&state.phase==='attack'&&state.table.length){
        button(ui.controls,'cg-action','Завершить атаку',()=>commit({type:'endAttack'},false));
      }
      if(active&&state.phase==='defend'){
        if(firstOpen()>=0)button(ui.controls,'cg-action danger','Взять карты',()=>commit({type:'take'},false));
        else button(ui.controls,'cg-action primary','Бито',()=>commit({type:'beat'},false));
      }
      ctx.turn(state.turn,state.phase==='attack'?'Выберите карту для атаки':'Отбейте каждую карту или возьмите стол');
    }
    state.deck=freshDeck();
    for(let round=0;round<6;round++)for(let p=0;p<N;p++)state.hands[p].push(state.deck.pop());
    state.trump=state.deck[state.deck.length-1].suit;
    state.attacker=ctx.players===1?0:(ctx.first%N);
    state.defender=nextPlayer(state.attacker);
    state.turn=state.attacker;
    render();scheduleBot();
    ctx.onMsg=d=>{if(d&&d.g==='durak'&&d.seq===seq+1&&d._from===state.turn){if(apply(d)){seq=d.seq;render();scheduleBot();}}};
  }

  function makeLastDeck(){
    const deck=[];let id=0;
    for(let color=0;color<4;color++){
      deck.push({id:id++,color,value:'0',kind:'number'});
      for(let n=1;n<=9;n++)for(let copy=0;copy<2;copy++)deck.push({id:id++,color,value:String(n),kind:'number'});
      for(const kind of ['skip','reverse','draw2'])for(let copy=0;copy<2;copy++)deck.push({id:id++,color,value:kind==='skip'?'⦸':kind==='reverse'?'↻':'+2',kind});
    }
    for(let copy=0;copy<4;copy++){deck.push({id:id++,color:null,value:'W',kind:'wild'});deck.push({id:id++,color:null,value:'+4',kind:'wild4'});}
    return deck;
  }
  function initLastCard(ctx){
    const cfg=seats(ctx,true),N=cfg.total,bots=cfg.bots;
    const ui=cardRoot(ctx,'Последняя карта','Сбрасывайте карты по цвету или значению, меняйте направление и отправляйте соперникам штрафные карты.','cg-last');
    const state={deck:[],hands:Array.from({length:N},()=>[]),discard:[],top:null,color:0,turn:0,direction:1,pending:0,winner:null};
    let seq=0,botTimer=null,ended=false,selectedWild=-1;
    const clearBot=()=>{if(botTimer!==null){clearTimeout(botTimer);botTimer=null;}};
    ctx.cleanup.push(clearBot);
    function drawOne(p){if(!state.deck.length&&state.discard.length>1){const top=state.discard.pop();state.deck=shuffle(state.discard,seedOf(ctx)+seq+31);state.discard=[top];}if(state.deck.length)state.hands[p].push(state.deck.pop());}
    function playable(card){
      if(state.pending)return card.kind==='draw2'||card.kind==='wild4';
      return card.kind==='wild'||card.kind==='wild4'||card.color===state.color||card.value===state.top.value;
    }
    function advance(steps){
      for(let i=0;i<steps;i++)state.turn=(state.turn+state.direction+N)%N;
    }
    function finish(p){
      if(ended)return;ended=true;state.winner=p;clearBot();render();
      ctx.end(p,'Победитель: '+playerName(ctx,bots,p));
    }
    function apply(a){
      if(ended||!a||typeof a.type!=='string')return false;
      const p=state.turn;
      if(a.type==='drawPenalty'){
        if(!state.pending)return false;
        const amount=state.pending;state.pending=0;
        for(let i=0;i<amount;i++)drawOne(p);
        advance(1);return true;
      }
      if(a.type==='draw'){
        if(state.pending)return false;
        drawOne(p);advance(1);return true;
      }
      if(a.type==='play'){
        if(!Number.isInteger(a.index))return false;
        const card=state.hands[p][a.index];
        if(!card||!playable(card))return false;
        if((card.kind==='wild'||card.kind==='wild4')&&!(Number.isInteger(a.color)&&a.color>=0&&a.color<4))return false;
        state.hands[p].splice(a.index,1);
        state.discard.push(state.top);state.top=card;
        if(card.kind==='wild'||card.kind==='wild4')state.color=a.color;
        else state.color=card.color;
        if(state.hands[p].length===0){finish(p);return true;}
        if(card.kind==='draw2')state.pending+=2;
        if(card.kind==='wild4')state.pending+=4;
        if(card.kind==='reverse'){
          state.direction*=-1;
          advance(N===2?2:1);
        }else if(card.kind==='skip')advance(2);
        else advance(1);
        return true;
      }
      return false;
    }
    function commit(a,remote){
      if(!apply(a))return false;
      if(!remote){seq++;if(!ctx.local)ctx.send(Object.assign({g:'lastcard',seq},a));}
      render();scheduleBot();return true;
    }
    function chooseColor(p){
      const counts=[0,0,0,0];state.hands[p].forEach(c=>{if(c.color!==null)counts[c.color]++;});
      return counts.indexOf(Math.max(...counts));
    }
    function botMove(){
      const p=state.turn;if(!bots.has(p)||ended)return;
      if(state.pending){
        const idx=state.hands[p].findIndex(c=>c.kind==='draw2'||c.kind==='wild4');
        if(idx>=0){const c=state.hands[p][idx];commit({type:'play',index:idx,color:c.color===null?chooseColor(p):c.color},false);}
        else commit({type:'drawPenalty'},false);
        return;
      }
      const options=state.hands[p].map((c,i)=>({c,i})).filter(x=>playable(x.c));
      if(options.length){
        options.sort((a,b)=>(b.c.kind==='wild4'?4:b.c.kind==='wild'?3:b.c.kind==='draw2'?2:0)-(a.c.kind==='wild4'?4:a.c.kind==='wild'?3:a.c.kind==='draw2'?2:0));
        const x=options[0];commit({type:'play',index:x.i,color:x.c.color===null?chooseColor(p):x.c.color},false);
      }else commit({type:'draw'},false);
    }
    function scheduleBot(){clearBot();if(!ended&&bots.has(state.turn))botTimer=setTimeout(()=>{botTimer=null;botMove();},450);}
    function render(){
      ui.hud.innerHTML='';
      ui.hud.append(node('span','cg-pill','Колода: '+state.deck.length),node('span','cg-pill','Цвет: '+['Синий','Красный','Зелёный','Жёлтый'][state.color]),node('span','cg-pill','Штраф: '+state.pending),node('span','cg-pill','Ход: '+playerName(ctx,bots,state.turn)));
      ui.table.innerHTML='';
      const seatsBox=node('div','cg-seats');
      for(let p=0;p<N;p++)seatsBox.append(node('div','cg-seat'+(p===state.turn?' active':''),playerName(ctx,bots,p)+' · '+state.hands[p].length+' карт'));
      const discard=node('div','cg-discard');
      const top=node('div','cg-color-card color-'+state.color);
      top.append(node('b','',state.top.value),node('small','',state.top.kind==='number'?'КАРТА':state.top.kind.toUpperCase()));
      discard.append(node('span','cg-muted','Сброс'),top);
      ui.table.append(seatsBox,discard);
      ui.hand.innerHTML='';
      if(canControl(ctx,bots,state.turn)){
        ui.hand.append(node('h3','cg-subtitle',playerName(ctx,bots,state.turn)+' · '+state.hands[state.turn].length+' карт'));
        const row=node('div','cg-card-row');
        state.hands[state.turn].forEach((c,i)=>{
          const b=node('button','cg-color-card color-'+(c.color===null?state.color:c.color)+(playable(c)?' playable':''));
          b.disabled=!playable(c);
          b.append(node('b','',c.value),node('small','',c.kind==='number'?'':c.kind.toUpperCase()));
          b.addEventListener('click',()=>{
            if(c.color===null){
              selectedWild=i;render();
            }else{selectedWild=-1;commit({type:'play',index:i,color:c.color},false);}
          });
          row.appendChild(b);
        });
        ui.hand.append(row);
        if(selectedWild>=0){
          const colors=node('div','cg-color-pick');
          ['Синий','Красный','Зелёный','Жёлтый'].forEach((name,color)=>button(colors,'cg-color-dot color-'+color,name,()=>{const index=selectedWild;selectedWild=-1;commit({type:'play',index,color},false);}));
          ui.hand.append(colors);
        }
      }else ui.hand.append(node('div','cg-wait','Ожидаем ход '+playerName(ctx,bots,state.turn)));
      ui.controls.innerHTML='';
      if(canControl(ctx,bots,state.turn)){
        if(state.pending)button(ui.controls,'cg-action danger','Взять '+state.pending+' карт',()=>commit({type:'drawPenalty'},false));
        else button(ui.controls,'cg-action','Взять карту',()=>commit({type:'draw'},false));
      }
      ctx.turn(state.turn,state.pending?'Сыграйте штрафную карту или возьмите штраф':'Сбросьте карту того же цвета или значения');
    }
    state.deck=shuffle(makeLastDeck(),seedOf(ctx)+71);
    for(let n=0;n<7;n++)for(let p=0;p<N;p++)drawOne(p);
    let topIndex=state.deck.findIndex(c=>c.kind==='number');
    if(topIndex<0)topIndex=state.deck.length-1;
    state.top=state.deck.splice(topIndex,1)[0];state.color=state.top.color;
    state.turn=ctx.players===1?0:ctx.first%N;
    render();scheduleBot();
    ctx.onMsg=d=>{if(d&&d.g==='lastcard'&&d.seq===seq+1&&d._from===state.turn){if(apply(d)){seq=d.seq;render();scheduleBot();}}};
  }

  function evaluateFive(cards){
    const ranks=cards.map(c=>c.rank).sort((a,b)=>b-a);
    const counts={};ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
    const groups=Object.keys(counts).map(Number).sort((a,b)=>counts[b]-counts[a]||b-a);
    const flush=cards.every(c=>c.suit===cards[0].suit);
    const unique=[...new Set(ranks)];
    if(unique.includes(14))unique.push(1);
    let straight=0;
    for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4){straight=unique[i];break;}
    if(flush&&straight)return [8,straight];
    if(counts[groups[0]]===4)return [7,groups[0],groups[1]];
    if(counts[groups[0]]===3&&counts[groups[1]]===2)return [6,groups[0],groups[1]];
    if(flush)return [5,...ranks];
    if(straight)return [4,straight];
    if(counts[groups[0]]===3)return [3,groups[0],...groups.slice(1).sort((a,b)=>b-a)];
    if(counts[groups[0]]===2&&counts[groups[1]]===2)return [2,Math.max(groups[0],groups[1]),Math.min(groups[0],groups[1]),groups[2]];
    if(counts[groups[0]]===2)return [1,groups[0],...groups.slice(1).sort((a,b)=>b-a)];
    return [0,...ranks];
  }
  function bestPokerHand(cards){
    let best=null;
    for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
      const score=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
      if(!best||compareScores(score,best)>0)best=score;
    }
    return best;
  }
  function compareScores(a,b){
    for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}
    return 0;
  }
  function initPoker(ctx){
    const cfg=seats(ctx,true),N=cfg.total,bots=cfg.bots;
    const ui=cardRoot(ctx,'Техасский холдем','Турнир на виртуальные фишки. Ставки, блеф, общие карты и 12 раздач — без реальных денег.','cg-poker');
    const state={chips:Array(N).fill(500),hands:Array.from({length:N},()=>[]),board:[],deck:[],bets:Array(N).fill(0),folded:Array(N).fill(false),acted:Array(N).fill(false),dealer:ctx.first%N,smallBlind:0,bigBlind:0,toAct:0,currentBet:0,minRaise:10,pot:0,stage:'',handNo:0,lastWinners:[],message:''};
    let seq=0,botTimer=null,ended=false;
    const clearBot=()=>{if(botTimer!==null){clearTimeout(botTimer);botTimer=null;}};
    ctx.cleanup.push(clearBot);
    function newDeck(seed){return shuffle(SUITS.flatMap(s=>Array.from({length:13},(_,i)=>({rank:i+2,suit:s,id:s+(i+2)}))),seed);}
    function nextLive(p,needsChips){
      for(let k=1;k<=N;k++){const i=(p+k)%N;if(!state.folded[i]&&(!needsChips||state.chips[i]>0))return i;}
      return -1;
    }
    function pay(p,amount){const n=Math.min(state.chips[p],Math.max(0,amount));state.chips[p]-=n;state.bets[p]+=n;state.pot+=n;return n;}
    function activePlayers(){return state.folded.map((f,i)=>f?-1:i).filter(i=>i>=0);}
    function finishTournament(){
      if(ended)return;
      ended=true;clearBot();
      const max=Math.max(...state.chips),winner=state.chips.indexOf(max);
      render();ctx.end(winner,'Турнир завершён · '+state.chips.map((v,i)=>playerName(ctx,bots,i)+': '+v).join(' · '));
    }
    function awardUncontested(p){
      state.chips[p]+=state.pot;state.message=playerName(ctx,bots,p)+' забирает банк без вскрытия';state.pot=0;state.handNo++;state.stage='between';
      checkTournament();render();
    }
    function showdown(){
      const active=activePlayers();
      if(active.length===1){awardUncontested(active[0]);return;}
      const scores=active.map(p=>({p,score:bestPokerHand(state.hands[p].concat(state.board))}));
      let best=scores[0].score;
      scores.forEach(x=>{if(compareScores(x.score,best)>0)best=x.score;});
      const winners=scores.filter(x=>compareScores(x.score,best)===0).map(x=>x.p);
      const share=Math.floor(state.pot/winners.length),remainder=state.pot%winners.length;
      winners.forEach((p,i)=>state.chips[p]+=share+(i<remainder?1:0));
      state.lastWinners=winners;state.message='Банк '+state.pot+' · победитель: '+winners.map(p=>playerName(ctx,bots,p)).join(', ');
      state.pot=0;state.handNo++;state.stage='between';checkTournament();render();
    }
    function checkTournament(){
      const alive=state.chips.map((v,i)=>v>0?i:-1).filter(i=>i>=0);
      if(alive.length<=1||state.handNo>=12){finishTournament();return true;}
      return false;
    }
    function runout(){
      while(state.board.length<5)state.board.push(state.deck.pop());
      showdown();
    }
    function startHand(first){
      if(ended)return;
      if(!first)state.dealer=nextSeat(state.dealer,N,1,i=>state.chips[i]>0);
      const alive=state.chips.filter(v=>v>0).length;
      if(alive<2){finishTournament();return;}
      state.deck=newDeck(seedOf(ctx)+state.handNo*313+state.dealer);
      state.hands=Array.from({length:N},()=>[]);
      state.board=[];state.bets=Array(N).fill(0);state.folded=state.chips.map(v=>v<=0);state.acted=Array(N).fill(false);
      state.pot=0;state.currentBet=0;state.minRaise=10;state.lastWinners=[];state.message='';
      for(let round=0;round<2;round++)for(let k=1;k<=N;k++){const p=(state.dealer+k)%N;if(!state.folded[p])state.hands[p].push(state.deck.pop());}
      state.smallBlind=N===2?state.dealer:nextSeat(state.dealer,N,1,p=>!state.folded[p]);
      state.bigBlind=nextSeat(state.smallBlind,N,1,p=>!state.folded[p]);
      pay(state.smallBlind,5);pay(state.bigBlind,10);state.currentBet=Math.max(...state.bets);state.stage='preflop';
      state.toAct=nextSeat(state.bigBlind,N,1,p=>!state.folded[p]&&state.chips[p]>0);
      if(state.toAct<0)runout();
      else {render();scheduleBot();}
    }
    function roundComplete(){
      for(let p=0;p<N;p++)if(!state.folded[p]&&state.chips[p]>0&&(!state.acted[p]||state.bets[p]!==state.currentBet))return false;
      return true;
    }
    function advanceStreet(){
      if(state.stage==='preflop'){state.board.push(state.deck.pop(),state.deck.pop(),state.deck.pop());state.stage='flop';}
      else if(state.stage==='flop'){state.board.push(state.deck.pop());state.stage='turn';}
      else if(state.stage==='turn'){state.board.push(state.deck.pop());state.stage='river';}
      else {showdown();return;}
      state.bets=Array(N).fill(0);state.currentBet=0;state.acted=Array(N).fill(false);
      const next=nextSeat(state.dealer,N,1,p=>!state.folded[p]&&state.chips[p]>0);
      if(next<0){runout();return;}
      state.toAct=next;render();scheduleBot();
    }
    function afterAction(){
      if(activePlayers().length===1){awardUncontested(activePlayers()[0]);return;}
      if(roundComplete()){advanceStreet();return;}
      const next=nextSeat(state.toAct,N,1,p=>!state.folded[p]&&state.chips[p]>0&&(!state.acted[p]||state.bets[p]!==state.currentBet));
      if(next<0){advanceStreet();return;}
      state.toAct=next;render();scheduleBot();
    }
    function apply(a){
      if(ended||!a||typeof a.type!=='string')return false;
      if(a.type==='next'){
        if(state.stage!=='between'||ended)return false;
        startHand(false);return true;
      }
      if(state.stage==='between'||state.stage==='showdown'||a.player!==undefined&&a.player!==state.toAct)return false;
      const p=state.toAct;if(state.folded[p]||state.chips[p]<=0)return false;
      if(a.type==='fold'){state.folded[p]=true;state.acted[p]=true;}
      else if(a.type==='call'){
        const due=Math.max(0,state.currentBet-state.bets[p]);pay(p,due);state.acted[p]=true;
      }else if(a.type==='raise'){
        const target=state.currentBet+Math.max(state.minRaise,Number(a.amount)||state.minRaise);
        const old=state.currentBet,paid=pay(p,target-state.bets[p]);
        if(state.bets[p]>old){
          state.currentBet=state.bets[p];state.minRaise=Math.max(1,state.currentBet-old);
          state.acted=Array(N).fill(false);state.acted[p]=true;
        }else state.acted[p]=true;
        if(!paid)return false;
      }else return false;
      afterAction();return true;
    }
    function commit(a,remote){
      if(!apply(a))return false;
      if(!remote){seq++;if(!ctx.local)ctx.send(Object.assign({g:'poker',seq},a));}
      render();scheduleBot();return true;
    }
    function strength(p){
      const h=state.hands[p];if(h.length<2)return 0;
      const pair=h[0].rank===h[1].rank?0.48:0;
      return pair+Math.max(h[0].rank,h[1].rank)/40+Math.min(h[0].rank,h[1].rank)/80;
    }
    function botMove(){
      const p=state.toAct;if(!bots.has(p)||ended||state.stage==='between')return;
      const due=state.currentBet-state.bets[p],s=strength(p),roll=rng(seedOf(ctx)+seq+p*97+state.handNo)();
      if(due===0){
        if(s>.62&&roll<.22)commit({type:'raise',amount:state.minRaise},false);
        else commit({type:'call'},false);
      }else if(s>.48&&due<=Math.max(30,state.chips[p]*.22))commit({type:'call'},false);
      else if(s>.72&&due<=state.chips[p]*.45&&roll<.35)commit({type:'raise',amount:state.minRaise},false);
      else commit({type:'fold'},false);
    }
    function scheduleBot(){clearBot();if(!ended&&state.stage!=='between'&&bots.has(state.toAct))botTimer=setTimeout(()=>{botTimer=null;botMove();},520);}
    function render(){
      ui.hud.innerHTML='';
      ui.hud.append(node('span','cg-pill','Раздача '+Math.min(12,state.handNo+1)+' / 12'),node('span','cg-pill','Банк: '+state.pot),node('span','cg-pill','Стадия: '+(state.stage||'—').toUpperCase()));
      ui.table.innerHTML='';
      const seatsBox=node('div','cg-poker-seats');
      for(let p=0;p<N;p++){
        const seat=node('div','cg-poker-seat'+(state.stage!=='between'&&p===state.toAct?' active':'')+(state.folded[p]?' folded':''));
        seat.append(node('b','',playerName(ctx,bots,p)+(p===state.dealer?' · D':'')),node('span','',state.chips[p]+' фишек'),node('small','',state.folded[p]?'Пас':state.bets[p]?'Ставка '+state.bets[p]:''));
        if(p===ctx.me||(ctx.players===1&&p===0)||ctx.local&&ctx.players>1&&state.stage!=='between'){
          const own=node('div','cg-hole');
          state.hands[p].forEach(c=>own.appendChild(playingCard(c,null,true,false)));
          seat.appendChild(own);
        }else if(!state.folded[p]){
          seat.append(node('span','cg-muted','2 закрытые карты'));
        }
        seatsBox.appendChild(seat);
      }
      const community=node('div','cg-community');
      state.board.forEach(c=>community.appendChild(playingCard(c,null,true,false)));
      for(let i=state.board.length;i<5;i++)community.appendChild(node('div','cg-card-placeholder','?'));
      ui.table.append(seatsBox,community,node('div','cg-pot','БАНК · '+state.pot),node('div','cg-message',state.message));
      ui.hand.innerHTML='';ui.controls.innerHTML='';
      if(state.stage==='between'){
        ui.hand.append(node('div','cg-wait',state.message||'Раздача завершена'));
        if(!ended&&ctx.canAct(0))button(ui.controls,'cg-action primary','Следующая раздача',()=>commit({type:'next'},false));
      }else if(canControl(ctx,bots,state.toAct)){
        ui.hand.append(node('div','cg-wait','Ваш ход · '+playerName(ctx,bots,state.toAct)+' · до колла '+Math.max(0,state.currentBet-state.bets[state.toAct])));
        button(ui.controls,'cg-action danger','Пас',()=>commit({type:'fold'},false));
        button(ui.controls,'cg-action','Чек / колл',()=>commit({type:'call'},false));
        button(ui.controls,'cg-action primary','Повысить на '+state.minRaise,()=>commit({type:'raise',amount:state.minRaise},false));
      }else ui.hand.append(node('div','cg-wait','Ход '+playerName(ctx,bots,state.toAct)));
      ctx.turn(state.toAct,state.stage==='between'?'Можно начать следующую раздачу':'Выберите действие');
    }
    startHand(true);
    ctx.onMsg=d=>{if(d&&d.g==='poker'&&d.seq===seq+1&&d._from===state.turn){if(apply(d)){seq=d.seq;render();scheduleBot();}}};
  }

  const DUNGEON_CARDS=[
    {name:'Удар',kind:'attack',cost:1,value:5},{name:'Тяжёлый удар',kind:'attack',cost:2,value:9},
    {name:'Щит',kind:'guard',cost:1,value:6},{name:'Лечение',kind:'heal',cost:1,value:4},
    {name:'Огненный шар',kind:'fire',cost:2,value:8},{name:'Яд',kind:'poison',cost:2,value:4},
    {name:'Передышка',kind:'draw',cost:0,value:2},{name:'Контратака',kind:'attack',cost:1,value:4}
  ];
  function initDungeon(ctx){
    const N=Math.max(1,Math.min(4,ctx.players||1));
    const ui=cardRoot(ctx,'Подземелье: Карты судьбы','Кооперативное приключение на 12 этажей. Собирайте комбинации, лечите отряд и побеждайте боссов вместе.','cg-dungeon');
    const state={floor:1,turn:ctx.first%N,round:1,energy:3,players:Array.from({length:N},()=>({hp:22,max:22,armor:0,poison:0,hand:[],deck:[],discard:[]})),enemy:null,done:Array(N).fill(false),log:[],ended:false};
    let seq=0;
    function draw(p,n){const hero=state.players[p];for(let k=0;k<n;k++){if(!hero.deck.length&&hero.discard.length)hero.deck=shuffle(hero.discard,seedOf(ctx)+state.floor*31+state.round*7+p),hero.discard=[];if(hero.deck.length)hero.hand.push(hero.deck.pop());}}
    function spawnEnemy(){
      const boss=state.floor%3===0;
      const names=['Пещерный слизень','Скелет-страж','Теневой волк','Каменный голем','Пепельный рыцарь'];
      const name=boss?'Хранитель этажа '+state.floor:names[(state.floor*7+state.round)%names.length];
      const hp=(boss?34:17)+state.floor*4+(N-1)*5;
      state.enemy={name,hp,max:hp,attack:boss?5+state.floor:2+Math.floor(state.floor/2),poison:0,boss};
    }
    function log(text){state.log.unshift(text);state.log=state.log.slice(0,5);}
    function finish(win){
      if(state.ended)return;state.ended=true;render();
      if(win)ctx.end(0,'Отряд прошёл все 12 этажей');
      else ctx.setStatus('Отряд пал на этаже '+state.floor,null,'Попробуйте другую колоду',true);
    }
    function clearFloor(){
      state.floor++;
      if(state.floor>12){finish(true);return;}
      state.players.forEach((h,p)=>{h.hp=Math.min(h.max,h.hp+3);h.armor=0;draw(p,1);});
      spawnEnemy();state.done=Array(N).fill(false);state.turn=ctx.first%N;state.energy=3;state.round++;
      log('Этаж пройден. Отряд восстановил силы.');
    }
    function enemyPhase(){
      if(state.enemy.poison>0){state.enemy.hp-=state.enemy.poison;state.enemy.poison=Math.max(0,state.enemy.poison-1);log('Яд наносит '+state.enemy.poison+' урона врагу.');}
      if(state.enemy.hp<=0){clearFloor();return;}
      state.players.forEach((h,p)=>{
        if(h.hp<=0)return;
        const damage=Math.max(0,state.enemy.attack-h.armor);
        h.hp=Math.max(0,h.hp-damage);h.armor=0;
      });
      log(state.enemy.name+' атакует весь отряд.');
      if(state.players.every(h=>h.hp<=0)){finish(false);return;}
      state.done=Array(N).fill(false);state.turn=nextSeat(state.turn,N,1,p=>state.players[p].hp>0);
      if(state.turn<0)state.turn=0;
      state.players.forEach((h,p)=>{if(h.hp>0)draw(p,2);});
      state.energy=3;state.round++;
    }
    function nextHero(){
      const next=nextSeat(state.turn,N,1,p=>state.players[p].hp>0&&!state.done[p]);
      if(next<0){enemyPhase();return;}
      state.turn=next;state.energy=3;draw(next,2);
    }
    function apply(a){
      if(state.ended||!a||typeof a.type!=='string')return false;
      const p=state.turn,h=state.players[p];
      if(h.hp<=0||state.done[p])return false;
      if(a.type==='play'){
        if(!Number.isInteger(a.index))return false;
        const card=h.hand[a.index];if(!card||card.cost>state.energy)return false;
        h.hand.splice(a.index,1);h.discard.push(card);state.energy-=card.cost;
        if(card.kind==='attack')state.enemy.hp-=card.value;
        else if(card.kind==='guard')h.armor+=card.value;
        else if(card.kind==='heal')h.hp=Math.min(h.max,h.hp+card.value);
        else if(card.kind==='fire'){state.enemy.hp-=card.value;state.enemy.poison+=1;}
        else if(card.kind==='poison')state.enemy.poison+=card.value;
        else if(card.kind==='draw')draw(p,card.value);
        log(playerName(ctx,new Set(),p)+' использует «'+card.name+'».');
        if(state.enemy.hp<=0){clearFloor();return true;}
        return true;
      }
      if(a.type==='end'){
        state.done[p]=true;
        if(state.players.every((x,i)=>x.hp<=0||state.done[i]))enemyPhase();
        else nextHero();
        return true;
      }
      return false;
    }
    function commit(a,remote){
      if(!apply(a))return false;
      if(!remote){seq++;if(!ctx.local)ctx.send(Object.assign({g:'dungeon',seq},a));}
      render();return true;
    }
    function render(){
      ui.hud.innerHTML='';
      ui.hud.append(node('span','cg-pill','Этаж '+state.floor+' / 12'),node('span','cg-pill','Раунд '+state.round),node('span','cg-pill','Энергия: '+state.energy));
      ui.table.innerHTML='';
      const enemy=node('div','cg-enemy'+(state.enemy.boss?' boss':''));
      enemy.append(node('span','cg-enemy-type',state.enemy.boss?'БОСС':'ПРОТИВНИК'),node('h3','',state.enemy.name),node('b','cg-enemy-hp',state.enemy.hp+' / '+state.enemy.max+' HP'),node('div','cg-healthbar', ''));
      const bar=node('div','cg-health-track');const fill=node('div','cg-health-fill');fill.style.width=Math.max(0,state.enemy.hp/state.enemy.max*100)+'%';bar.appendChild(fill);enemy.appendChild(bar);
      const heroes=node('div','cg-heroes');
      state.players.forEach((h,p)=>{
        const hero=node('div','cg-hero'+(p===state.turn?' active':'')+(h.hp<=0?' dead':''));
        hero.append(node('b','',ctx.who(p)),node('span','',h.hp+' / '+h.max+' HP'),node('small','', 'Броня '+h.armor+' · '+h.hand.length+' карт'));
        hero.append(node('div','cg-health-track', '') );
        const track=hero.children[3],barFill=node('div','cg-health-fill');barFill.style.width=Math.max(0,h.hp/h.max*100)+'%';track.appendChild(barFill);
        heroes.appendChild(hero);
      });
      const logBox=node('div','cg-log');
      state.log.forEach(line=>logBox.appendChild(node('div','',line)));
      ui.table.append(enemy,heroes,logBox);
      ui.hand.innerHTML='';ui.controls.innerHTML='';
      if(canControl(ctx,new Set(),state.turn)&&state.players[state.turn].hp>0&&!state.done[state.turn]){
        ui.hand.append(node('h3','cg-subtitle',ctx.who(state.turn)+' · выберите карту'));
        const row=node('div','cg-card-row');
        state.players[state.turn].hand.forEach((c,i)=>{
          const b=node('button','cg-dungeon-card '+c.kind);
          b.disabled=c.cost>state.energy;
          b.append(node('b','',c.name),node('span','',c.cost+' энергии'),node('small','',c.value?String(c.value):'Эффект'));
          b.addEventListener('click',()=>commit({type:'play',index:i},false));
          row.appendChild(b);
        });
        ui.hand.append(row);
        button(ui.controls,'cg-action','Завершить ход',()=>commit({type:'end'},false));
      }else ui.hand.append(node('div','cg-wait','Ожидаем ход '+ctx.who(state.turn)));
      ctx.turn(state.turn,'Сыграйте карты или завершите ход');
    }
    const rand=rng(seedOf(ctx));
    state.players.forEach((h,p)=>{
      h.deck=shuffle(Array.from({length:24},(_,i)=>Object.assign({id:p+'-'+i},DUNGEON_CARDS[i%DUNGEON_CARDS.length])),seedOf(ctx)+p*23);
      draw(p,5);
    });
    spawnEnemy();render();
    ctx.onMsg=d=>{if(d&&d.g==='dungeon'&&d.seq===seq+1&&d._from===state.turn){if(apply(d)){seq=d.seq;render();}}};
  }

  const KING_CARDS=['recruit','claim','march','fortify','tax','scout','march','claim'];
  const KING_CARD_NAMES={recruit:'Набор войск',claim:'Колонизация',march:'Марш',fortify:'Укрепление',tax:'Налог',scout:'Разведка'};
  const TERRAIN=['Равнина','Лес','Горы'];
  const TERRAIN_BONUS=[0,1,2];
  function adjacent(a,b){const ax=a%5,ay=Math.floor(a/5),bx=b%5,by=Math.floor(b/5);return Math.abs(ax-bx)+Math.abs(ay-by)===1;}
  function initKingdoms(ctx){
    const cfg=seats(ctx,true),N=cfg.total,bots=cfg.bots;
    const ui=cardRoot(ctx,'Королевства','Захватывайте провинции, разыгрывайте тактические карты и стройте свою империю на общей карте.','cg-kingdom');
    const rand=rng(seedOf(ctx)+77);
    const state={map:Array.from({length:25},(_,i)=>({id:i,owner:null,troops:0,fort:0,terrain:Math.floor(rand()*3)})),coins:Array(N).fill(5),hands:Array.from({length:N},()=>[]),deck:[],turn:ctx.players===1?0:ctx.first%N,round:1,selected:-1,source:-1,ended:false};
    let seq=0,botTimer=null;
    const clearBot=()=>{if(botTimer!==null){clearTimeout(botTimer);botTimer=null;}};
    ctx.cleanup.push(clearBot);
    const starts=N===2?[0,24]:N===3?[0,4,22]:[0,4,20,24];
    starts.forEach((tile,p)=>{state.map[tile].owner=p;state.map[tile].troops=3;});
    function draw(p){if(!state.deck.length)state.deck=shuffle(KING_CARDS,seedOf(ctx)+state.round*17+p);state.hands[p].push(state.deck.pop());}
    for(let p=0;p<N;p++){state.hands[p]=[];for(let i=0;i<3;i++)draw(p);}
    function owned(p){return state.map.filter(t=>t.owner===p).length;}
    function neighbors(tile){return state.map.filter(t=>adjacent(tile.id,t.id));}
    function finish(){
      if(state.ended)return;state.ended=true;clearBot();
      const score=Array.from({length:N},(_,p)=>owned(p)*5+state.map.filter(t=>t.owner===p).reduce((sum,t)=>sum+t.troops+t.fort,0)+state.coins[p]);
      const winner=score.indexOf(Math.max(...score));
      render();ctx.end(winner,'Очки: '+score.map((v,p)=>playerName(ctx,bots,p)+' '+v).join(' · '));
    }
    function advance(){
      state.selected=-1;state.source=-1;
      if(owned(state.turn)>=8){finish();return;}
      state.turn++;
      if(state.turn>=N){state.turn=0;state.round++;}
      if(state.round>8){finish();return;}
    }
    function apply(a){
      if(state.ended||!a||a.type!=='play'||a.player!==state.turn||!Number.isInteger(a.index))return false;
      const p=state.turn,card=state.hands[p][a.index];if(!card)return false;
      const target=Number.isInteger(a.target)?state.map[a.target]:null;
      const source=Number.isInteger(a.source)?state.map[a.source]:null;
      if(card==='tax'){
        state.coins[p]+=3;
      }else if(card==='recruit'){
        if(!target||target.owner!==p)return false;
        target.troops+=2;
      }else if(card==='fortify'){
        if(!target||target.owner!==p)return false;
        target.fort+=2;
      }else if(card==='scout'){
        if(!target||target.owner!==p)return false;
        target.troops+=1;state.coins[p]+=1;
      }else if(card==='claim'){
        if(!target||target.owner!==null||state.coins[p]<2||!state.map.some(t=>t.owner===p&&adjacent(t.id,target.id)))return false;
        state.coins[p]-=2;target.owner=p;target.troops=1;
      }else if(card==='march'){
        if(!source||!target||source.owner!==p||source.id===target.id||!adjacent(source.id,target.id)||source.troops<2)return false;
        const moved=Math.max(1,Math.floor(source.troops/2));source.troops-=moved;
        if(target.owner===p){target.troops+=moved;}
        else{
          const attack=moved,defence=target.troops+target.fort+TERRAIN_BONUS[target.terrain];
          if(attack>defence){target.owner=p;target.troops=attack-defence;target.fort=0;}
          else target.troops=Math.max(1,defence-attack);
        }
      }else return false;
      state.hands[p].splice(a.index,1);draw(p);advance();return true;
    }
    function commit(a,remote){
      if(!apply(a))return false;
      if(!remote){seq++;if(!ctx.local)ctx.send(Object.assign({g:'kingdom',seq},a));}
      render();scheduleBot();return true;
    }
    function botMove(){
      const p=state.turn;if(!bots.has(p)||state.ended)return;
      const hand=state.hands[p],tiles=state.map;
      let action=null;
      for(let i=0;i<hand.length&&!action;i++){
        const card=hand[i];
        if(card==='claim'&&state.coins[p]>=2){
          const t=tiles.find(t=>t.owner===null&&tiles.some(o=>o.owner===p&&adjacent(o.id,t.id)));
          if(t)action={type:'play',player:p,index:i,target:t.id};
        }else if(card==='recruit'){
          const t=tiles.find(t=>t.owner===p&&t.troops<3);if(t)action={type:'play',player:p,index:i,target:t.id};
        }else if(card==='march'){
          const source=tiles.find(t=>t.owner===p&&t.troops>=2&&tiles.some(o=>adjacent(t.id,o.id)&&o.owner!==p));
          const target=source&&tiles.find(t=>adjacent(t.id,source.id)&&t.owner!==p);
          if(source&&target)action={type:'play',player:p,index:i,source:source.id,target:target.id};
        }else if(card==='fortify'){
          const t=tiles.find(t=>t.owner===p);if(t)action={type:'play',player:p,index:i,target:t.id};
        }else if(card==='scout'){
          const t=tiles.find(t=>t.owner===p);if(t)action={type:'play',player:p,index:i,target:t.id};
        }else if(card==='tax')action={type:'play',player:p,index:i};
      }
      if(!action){
        let index=hand.findIndex(c=>c==='tax');
        if(index<0){index=0;hand[index]='tax';}
        action={type:'play',player:p,index};
      }
      commit(action,false);
    }
    function scheduleBot(){clearBot();if(!state.ended&&bots.has(state.turn))botTimer=setTimeout(()=>{botTimer=null;botMove();},500);}
    function render(){
      ui.hud.innerHTML='';
      ui.hud.append(node('span','cg-pill','Раунд '+Math.min(8,state.round)+' / 8'),node('span','cg-pill','Ход: '+playerName(ctx,bots,state.turn)),node('span','cg-pill','Монеты: '+state.coins[state.turn]));
      ui.table.innerHTML='';
      const map=node('div','cg-map');
      state.map.forEach(tile=>{
        const b=node('button','cg-territory terrain-'+tile.terrain+(tile.owner===null?' neutral':' owner-'+tile.owner)+(tile.id===state.selected?' selected':'')+(tile.id===state.source?' source':''));
        b.disabled=!canControl(ctx,bots,state.turn);
        b.append(node('b','',tile.owner===null?'·':String(tile.owner+1)),node('span','',tile.troops+' ⚔'),node('small','',TERRAIN[tile.terrain]));
        b.addEventListener('click',()=>selectTile(tile.id));
        map.appendChild(b);
      });
      ui.table.append(map);
      const info=node('div','cg-king-info');
      for(let p=0;p<N;p++)info.append(node('span','cg-pill player-'+p,playerName(ctx,bots,p)+' · '+owned(p)+' пров. · '+state.coins[p]+' мон.'));
      ui.table.append(info);
      ui.hand.innerHTML='';ui.controls.innerHTML='';
      if(canControl(ctx,bots,state.turn)){
        ui.hand.append(node('h3','cg-subtitle',playerName(ctx,bots,state.turn)+' · тактические карты'));
        const row=node('div','cg-card-row');
        state.hands[state.turn].forEach((card,i)=>{
          const b=button(row,'cg-strategy-card'+(state.selected===i?' selected':''),KING_CARD_NAMES[card],()=>selectCard(i));
        });
        ui.hand.append(row);
        if(state.selected>=0)ui.hand.append(node('div','cg-wait','Карта: '+KING_CARD_NAMES[state.hands[state.turn][state.selected]]+' · '+(state.source>=0?'Теперь выберите соседнюю цель':'Выберите провинцию на карте')));
      }else ui.hand.append(node('div','cg-wait','Ход '+playerName(ctx,bots,state.turn)));
      ctx.turn(state.turn,'Сыграйте карту и выберите цель на карте');
    }
    function selectCard(index){
      if(!canControl(ctx,bots,state.turn)||!state.hands[state.turn][index])return;
      state.selected=index;state.source=-1;
      const card=state.hands[state.turn][index];
      if(card==='tax')commit({type:'play',player:state.turn,index},false);
      else render();
    }
    function selectTile(id){
      if(!canControl(ctx,bots,state.turn)||state.selected<0)return;
      const card=state.hands[state.turn][state.selected],tile=state.map[id];
      if(card==='march'){
        if(state.source<0){
          if(tile.owner===state.turn&&tile.troops>=2){state.source=id;render();}
          return;
        }
        if(state.source===id){state.source=-1;render();return;}
        commit({type:'play',player:state.turn,index:state.selected,source:state.source,target:id},false);
      }else commit({type:'play',player:state.turn,index:state.selected,target:id},false);
    }
    render();scheduleBot();
    ctx.onMsg=d=>{if(d&&d.g==='kingdom'&&d.seq===seq+1&&d._from===state.turn&&d.player===state.turn){if(apply(d)){seq=d.seq;render();scheduleBot();}}};
  }

  function registerCardGames(Games,LIST,el){
    const icon='<rect x="9" y="7" width="23" height="32" rx="3"/><rect x="17" y="11" width="23" height="32" rx="3"/><path d="M23 18l5 5 5-5M28 23v9"/>';
    register(Games,LIST,'durak','Дурак','Классика на 36 карт · подкидывания · козыри · боты.',1,4,icon,initDurak);
    register(Games,LIST,'lastcard','Последняя карта','Комбо, смена цвета, реверс и штрафные карты.',1,4,icon,initLastCard);
    register(Games,LIST,'poker','Техасский холдем','Турнир на виртуальные фишки · блеф · 12 раздач.',1,4,icon,initPoker);
    register(Games,LIST,'dungeon','Подземелье: Карты судьбы','Кооперативная колода, боссы и 12 этажей.',1,4,icon,initDungeon);
    register(Games,LIST,'kingdom','Королевства','Стратегическая карта провинций и тактические карты.',1,4,icon,initKingdoms);
  }
  window.registerCardGames=registerCardGames;
  window.BananCardRules={
    durakBeats:beats,
    lastCardPlayable:(card,top,color,pending)=>pending?(card.kind==='draw2'||card.kind==='wild4'):(card.kind==='wild'||card.kind==='wild4'||card.color===color||card.value===top.value),
    evaluateFive,
    bestPokerHand,
    comparePoker:compareScores,
    adjacent,
    territoryTerrainBonus:TERRAIN_BONUS.slice()
  };
})();
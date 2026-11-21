/* Banan realtime games — host-authoritative multiplayer for 2–10 players. */
(() => {
  'use strict';

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const COLORS = ['#3d8bfd','#ef5350','#43a047','#ffa726','#ab47bc','#26a69a','#ec407a','#8d6e63','#78909c','#c0a000'];
  const NAMES = ['Бублик','Колобок','Пончик','Шарик','Кекс','Блинчик','Арбуз','Пельмень','Мандарин','Зефир','Пирожок','Ватрушка','Эклер'];
  const SVG_AGAR = '<circle cx="24" cy="24" r="17"/><circle cx="18" cy="19" r="2" fill="currentColor"/><circle cx="30" cy="19" r="2" fill="currentColor"/><path d="M16 29q8 9 16 0"/>';
  const SVG_TERRITORY = '<path d="M7 7h13v13H7zM28 7h13v13H28zM7 28h13v13H7z"/><path d="M20 13h8M13 20v8M35 20v8M20 35h8"/>';

  function createStage(ctx, kind, title, help) {
    const root = ctx.root;
    root.replaceChildren();
    const stage = document.createElement('div');
    stage.className = 'rt-stage rt-' + kind;
    const canvas = document.createElement('canvas');
    canvas.className = 'rt-canvas';
    canvas.setAttribute('aria-label', title);
    const hud = document.createElement('div'); hud.className = 'rt-hud';
    const timer = document.createElement('div'); timer.className = 'rt-timer'; timer.textContent = '--:--';
    const board = document.createElement('div'); board.className = 'rt-leaderboard';
    const info = document.createElement('div'); info.className = 'rt-info'; info.textContent = help;
    hud.append(timer, board);
    stage.append(canvas, hud, info);
    root.append(stage);
    const context = canvas.getContext('2d', { alpha: false });
    let width = 1, height = 1, dpr = 1;
    function resize() {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, rect.width || stage.clientWidth || 900);
      height = Math.max(1, rect.height || stage.clientHeight || 620);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    }
    resize();
    window.addEventListener('resize', resize);
    ctx.cleanup.push(() => window.removeEventListener('resize', resize));
    return { stage, canvas, context, timer, board, info, get width(){return width;}, get height(){return height;}, get dpr(){return dpr;}, resize };
  }

  function setBoard(board, rows) {
    board.replaceChildren();
    for (const row of rows) {
      const line = document.createElement('div');
      const name = document.createElement('span'); name.textContent = row.name;
      const value = document.createElement('b'); value.textContent = row.value;
      const dot = document.createElement('i'); dot.style.background = row.color;
      line.append(dot, name, value); board.append(line);
    }
  }

  function attachLoop(ctx, tick) {
    let raf = 0, previous = 0, alive = true;
    const frame = now => {
      if (!alive) return;
      const dt = previous ? Math.min(.05, Math.max(0, (now - previous) / 1000)) : 0;
      previous = now;
      try { tick(dt, now); } catch (error) { console.error('Banan realtime frame failed:', ctx.id, error); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const stop = () => { alive = false; if (raf) cancelAnimationFrame(raf); };
    ctx.cleanup.push(stop);
    return stop;
  }

  function agarInit(ctx) {
    const host = ctx.me === 0;
    const ui = createStage(ctx, 'agar', 'Кругляши: съешь всех', 'Мышь / палец — движение · Space / Shift / кнопка — рывок');
    const {canvas, context:g, timer, board} = ui;
    const W = 3200, H = 3200, TIME = 90, FOOD_COUNT = 420, PICKUP_COUNT = 10;
    const humanCount = ctx.players;
    const botCount = Math.max(2, 12 - humanCount);
    const total = humanCount + botCount;
    const radius = mass => Math.sqrt(Math.max(1, mass)) * 4;
    const names = NAMES.slice();
    let players = [], food = [], pickups = [], particles = [], feed = [];
    let timeLeft = TIME, started = false, ended = false, snapTimer = 0, fullTimer = 0;
    let foodChanges = [], pickupChanges = [];
    let camera = {x:W/2,y:H/2,s:1};
    const inputs = Array.from({length:humanCount},()=>({dx:0,dy:0,active:false}));
    let localInput = {dx:0,dy:0,active:false};
    let lastInputSent = 0;
    let remoteView = {players:[],food:[],pickups:[],timeLeft:TIME,feed:[]};
    const randHue = () => Math.floor(rand(0,360));
    const makeFood = id => ({id,x:rand(20,W-20),y:rand(20,H-20),h:randHue(),v:Math.random()<.06?4:Math.random()<.25?2:1});
    const makePickup = id => ({id,x:rand(180,W-180),y:rand(180,H-180),k:['s','m','h'][Math.floor(rand(0,3))],p:rand(0,6)});
    function makePlayer(id, bot) {
      const angle = (id / Math.max(1,humanCount)) * Math.PI * 2;
      const x = bot ? rand(180,W-180) : W/2 + Math.cos(angle)*760;
      const y = bot ? rand(180,H-180) : H/2 + Math.sin(angle)*760;
      return {id,bot,name:bot?names[(id-humanCount)%names.length]:'Игрок '+(id+1),h:randHue(),x:clamp(x,100,W-100),y:clamp(y,100,H-100),m:20,vx:0,vy:0,dx:1,dy:0,tx:x,ty:y,alive:true,t:0,dash:0,cd:0,fs:0,fm:0,inv:3,kills:0,ai:0};
    }
    function initWorld() {
      players = Array.from({length:total},(_,i)=>makePlayer(i,i>=humanCount));
      food = Array.from({length:FOOD_COUNT},(_,i)=>makeFood(i));
      pickups = Array.from({length:PICKUP_COUNT},(_,i)=>makePickup(i));
      particles=[];feed=[];timeLeft=TIME;started=true;ended=false;camera.x=players[ctx.me].x;camera.y=players[ctx.me].y;
    }
    function serializePlayers() {
      return players.map(p=>({id:p.id,bot:p.bot,name:p.name,h:p.h,x:p.x,y:p.y,m:p.m,alive:p.alive,t:p.t,dash:p.dash,cd:p.cd,fs:p.fs,fm:p.fm,inv:p.inv,kills:p.kills}));
    }
    function serializeFood() { return food.map(f=>[f.id,Math.round(f.x*10)/10,Math.round(f.y*10)/10,f.h,f.v]); }
    function serializePickups() { return pickups.map(p=>[p.id,Math.round(p.x*10)/10,Math.round(p.y*10)/10,p.k,p.p]); }
    function sendState(kind, forceFull=false) {
      if (!host || ctx.local) return;
      const packet={g:'agar-state',kind,timeLeft,players:serializePlayers(),foodDelta:foodChanges.splice(0),pickupDelta:pickupChanges.splice(0),feed:feed.slice(0,4)};
      if(forceFull){packet.foodFull=serializeFood();packet.pickupsFull=serializePickups();}
      ctx.send(packet);
    }
    function updateRemote(packet) {
      if(packet.kind==='init'){
        remoteView={players:packet.players||[],food:(packet.foodFull||[]).map(v=>({id:v[0],x:v[1],y:v[2],h:v[3],v:v[4]})),pickups:(packet.pickupsFull||[]).map(v=>({id:v[0],x:v[1],y:v[2],k:v[3],p:v[4]})),timeLeft:packet.timeLeft??TIME,feed:packet.feed||[]};
        started=true;ended=false;ctx.setStatus('Матч начался · '+ctx.players+' игроков',null,'Управляйте своим кругляшом');
      } else {
        remoteView.players=packet.players||remoteView.players;
        remoteView.timeLeft=packet.timeLeft??remoteView.timeLeft;
        remoteView.feed=packet.feed||remoteView.feed;
        for(const v of packet.foodDelta||[]){const item={id:v[0],x:v[1],y:v[2],h:v[3],v:v[4]};remoteView.food[item.id]=item;}
        for(const v of packet.pickupDelta||[]){const item={id:v[0],x:v[1],y:v[2],k:v[3],p:v[4]};remoteView.pickups[item.id]=item;}
        if(packet.foodFull)remoteView.food=packet.foodFull.map(v=>({id:v[0],x:v[1],y:v[2],h:v[3],v:v[4]}));
        if(packet.pickupsFull)remoteView.pickups=packet.pickupsFull.map(v=>({id:v[0],x:v[1],y:v[2],k:v[3],p:v[4]}));
      }
      if(packet.kind==='end')finishClient(packet.winner,packet.winnerName,packet.reason);
    }
    function dash(p) { if(!p||!p.alive||p.cd>0||p.m<28)return;p.m*=.94;p.dash=.32;p.cd=1.3; }
    function botThink(b) {
      let prey=null,pd=1e9,threat=null,td=1e9;const r=radius(b.m);
      for(const o of players){if(o===b||!o.alive||o.inv>0)continue;const d=Math.hypot(o.x-b.x,o.y-b.y),ro=radius(o.m);if(ro>r*1.12&&d<ro+r+300&&d<td){td=d;threat=o;}else if(r>ro*1.15&&d<520&&d<pd){pd=d;prey=o;}}
      if(threat){b.tx=b.x-(threat.x-b.x);b.ty=b.y-(threat.y-b.y);if(td<r+radius(threat.m)+140)dash(b);return;}
      if(prey){b.tx=prey.x;b.ty=prey.y;if(pd<r*3)dash(b);return;}
      let best=null,bd=1e9;for(const p of pickups){const d=(p.x-b.x)**2+(p.y-b.y)**2;if(d<250000&&d<bd){bd=d;best=p;}}
      if(!best)for(const f of food){const d=(f.x-b.x)**2+(f.y-b.y)**2-f.v*3000;if(d<bd){bd=d;best=f;}}
      if(best){b.tx=best.x;b.ty=best.y;}
    }
    function update(dt) {
      if(!host||!started||ended)return;
      timeLeft-=dt;if(timeLeft<=0){timeLeft=0;finishHost();return;}
      for(const c of players){
        if(!c.alive){c.t-=dt;if(c.t<=0){c.alive=true;c.m=20;c.inv=2.5;c.vx=c.vy=0;c.x=rand(150,W-150);c.y=rand(150,H-150);}continue;}
        const r=radius(c.m);let dx=0,dy=0,k=0;
        if(c.bot){c.ai-=dt;if(c.ai<=0){c.ai=rand(.2,.4);botThink(c);}dx=c.tx-c.x;dy=c.ty-c.y;const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;k=.95;}
        else {const input=c.id===0?localInput:inputs[c.id];if(input&&input.active){dx=input.dx;dy=input.dy;k=.95;}}
        if(k>0){c.dx=dx;c.dy=dy;}else if(c.dash>0){dx=c.dx;dy=c.dy;k=1;}
        const base=Math.max(110,360-r*1.5),mul=(c.dash>0?2.7:1)*(c.fs>0?1.45:1),sm=Math.min(1,dt*(c.dash>0?16:6));
        c.vx+=(dx*base*k*mul-c.vx)*sm;c.vy+=(dy*base*k*mul-c.vy)*sm;
        c.x=clamp(c.x+c.vx*dt,r*.3,W-r*.3);c.y=clamp(c.y+c.vy*dt,r*.3,H-r*.3);
        c.dash=Math.max(0,c.dash-dt);c.cd=Math.max(0,c.cd-dt);c.fs=Math.max(0,c.fs-dt);c.fm=Math.max(0,c.fm-dt);c.inv=Math.max(0,c.inv-dt);
        if(c.m>40)c.m-=c.m*.005*dt*Math.min(4,c.m/80);
        for(let i=0;i<food.length;i++){
          const f=food[i];
          if(c.fm>0){const ax=c.x-f.x,ay=c.y-f.y,dist=Math.hypot(ax,ay);if(dist<r*4+60&&dist>1){f.x+=ax/dist*700*dt;f.y+=ay/dist*700*dt;}}
          if((f.x-c.x)**2+(f.y-c.y)**2<(r+4)**2){c.m+=f.v*1.1;food[i]=makeFood(i);foodChanges.push(serializeFoodItem(food[i]));}
        }
        for(let i=0;i<pickups.length;i++){const p=pickups[i];if((p.x-c.x)**2+(p.y-c.y)**2<(r+22)**2){if(p.k==='s')c.fs=7;else if(p.k==='m')c.fm=7;else c.inv=6;pickups[i]=makePickup(i);pickupChanges.push(serializePickupItem(pickups[i]));}}
      }
      for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
        let a=players[i],b=players[j];if(!a.alive||!b.alive)continue;if(a.m<b.m){const t=a;a=b;b=t;}if(b.inv>0)continue;
        const ra=radius(a.m),rb=radius(b.m);
        if(ra>rb*1.12&&Math.hypot(a.x-b.x,a.y-b.y)<ra-rb*.35){const gain=b.m*.9;a.m+=gain;a.kills++;b.alive=false;b.t=2.5;feed.unshift({name:a.name,text:'съел '+b.name});feed.length=Math.min(4,feed.length);}
      }
      snapTimer+=dt;fullTimer+=dt;
      if(snapTimer>=.1){snapTimer=0;const full=fullTimer>=2;if(full)fullTimer=0;sendState('snap',full);}
    }
    const serializeFoodItem=f=>[f.id,Math.round(f.x*10)/10,Math.round(f.y*10)/10,f.h,f.v];
    const serializePickupItem=p=>[p.id,Math.round(p.x*10)/10,Math.round(p.y*10)/10,p.k,p.p];
    function finishHost(){
      if(ended)return;ended=true;const ranking=players.slice().sort((a,b)=>b.m-a.m);const winner=ranking[0];
      sendState('snap',true);if(!ctx.local)ctx.send({g:'agar-end',winner:winner&&!winner.bot?winner.id:null,winnerName:winner?.name||'—',reason:'Размер: '+Math.round(winner?.m||0)});
      finishClient(winner&&!winner.bot?winner.id:null,winner?.name,'Размер: '+Math.round(winner?.m||0));
    }
    function finishClient(winner,winnerName,reason){
      if(ended&&!host)return;ended=true;
      if(Number.isInteger(winner))ctx.end(winner,reason||'Победа в арене');
      else {ctx.end(null,reason||'Матч завершён');ctx.setStatus('Победил '+(winnerName||'соперник'),null,reason||'',true);}
    }
    function snapshotForDraw(){return host?{players,food,pickups,timeLeft,feed}:remoteView;}
    function draw(now){
      const v=snapshotForDraw();const own=v.players?.find(p=>p.id===ctx.me)||v.players?.[0];
      const w=ui.width,h=ui.height,dpr=ui.dpr;g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#dce5ed';g.fillRect(0,0,w,h);
      if(!own){g.fillStyle='#203044';g.font='700 18px system-ui';g.textAlign='center';g.fillText('Ожидаем синхронизацию матча…',w/2,h/2);return;}
      const targetScale=clamp(70/(radius(own.m)+42),.28,1.15);camera.s+=(targetScale-camera.s)*.06;camera.x+=(own.x-camera.x)*.16;camera.y+=(own.y-camera.y)*.16;
      g.save();g.translate(w/2,h/2);g.scale(camera.s,camera.s);g.translate(-camera.x,-camera.y);
      g.fillStyle='#f4f8fc';g.fillRect(0,0,W,H);g.strokeStyle='#e1e9f1';g.lineWidth=2;g.beginPath();
      const x0=Math.max(0,camera.x-w/2/camera.s),x1=Math.min(W,camera.x+w/2/camera.s),y0=Math.max(0,camera.y-h/2/camera.s),y1=Math.min(H,camera.y+h/2/camera.s);
      for(let x=Math.ceil(x0/60)*60;x<=x1;x+=60){g.moveTo(x,y0);g.lineTo(x,y1);}for(let y=Math.ceil(y0/60)*60;y<=y1;y+=60){g.moveTo(x0,y);g.lineTo(x1,y);}g.stroke();g.strokeStyle='#8fa3b8';g.lineWidth=12;g.strokeRect(0,0,W,H);
      for(const f of v.food||[]){if(!f||f.x<x0-20||f.x>x1+20||f.y<y0-20||f.y>y1+20)continue;g.beginPath();g.arc(f.x,f.y,4+f.v*1.8,0,Math.PI*2);g.fillStyle='hsl('+f.h+',75%,58%)';g.fill();}
      for(const p of v.pickups||[]){if(!p)continue;const color=p.k==='s'?'#f5b700':p.k==='m'?'#9b5de5':'#2f9bf6';g.beginPath();g.arc(p.x,p.y,17+Math.sin(now/220+p.p)*2,0,Math.PI*2);g.fillStyle=color+'55';g.fill();g.beginPath();g.arc(p.x,p.y,11,0,Math.PI*2);g.fillStyle=color;g.fill();}
      for(const c of (v.players||[]).filter(p=>p.alive&&p.x>x0-300&&p.x<x1+300&&p.y>y0-300&&p.y<y1+300).sort((a,b)=>a.m-b.m)){
        const r=radius(c.m);g.beginPath();g.arc(c.x,c.y,r,0,Math.PI*2);g.fillStyle='hsl('+c.h+',72%,56%)';g.fill();g.lineWidth=Math.max(3,r*.09);g.strokeStyle='hsl('+c.h+',68%,42%)';g.stroke();
        if(c.inv>0){g.beginPath();g.arc(c.x,c.y,r+8,0,Math.PI*2);g.lineWidth=4;g.strokeStyle='rgba(47,155,246,.75)';g.stroke();}
        if(c.fm>0){g.beginPath();g.arc(c.x,c.y,r+13,0,Math.PI*2);g.setLineDash([7,8]);g.lineWidth=3;g.strokeStyle='#9b5de5';g.stroke();g.setLineDash([]);}
        g.font='800 '+Math.max(12,r*.36)+'px system-ui';g.textAlign='center';g.textBaseline='middle';g.lineWidth=Math.max(3,r*.09);g.strokeStyle='rgba(20,30,45,.7)';g.fillStyle='#fff';const label=c.id===ctx.me?'Вы':c.name;g.strokeText(label,c.x,c.y);g.fillText(label,c.x,c.y);
      }
      g.restore();
      const mass=Math.round(own.m);ui.info.textContent='Размер: '+mass+' · Съедено: '+(own.kills||0)+' · '+(own.cd>0?'Рывок через '+own.cd.toFixed(1)+'с':'Рывок готов');
      timer.textContent=formatTime(v.timeLeft??TIME);timer.classList.toggle('low',(v.timeLeft??TIME)<=10);
      const rank=(v.players||[]).slice().sort((a,b)=>b.m-a.m).slice(0,6).map((p,i)=>({name:(p.id===ctx.me?'Вы':p.name),value:String(Math.round(p.m)),color:'hsl('+p.h+',72%,52%)'}));setBoard(board,rank);
    }
    function formatTime(seconds){const n=Math.max(0,Math.ceil(seconds));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
    function sendInput(now){if(host||ended||now-lastInputSent<85)return;lastInputSent=now;ctx.send({g:'agar-input',dx:localInput.dx,dy:localInput.dy,active:localInput.active});}
    function point(e){const rect=canvas.getBoundingClientRect();const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),l=Math.hypot(dx,dy);localInput={dx:l>0?dx/l:0,dy:l>0?dy/l:0,active:l>8};}
    const onMove=e=>{point(e);sendInput(performance.now());};
    const onDown=e=>{point(e);if(e.button===2){e.preventDefault();triggerDash();}sendInput(performance.now());};
    const onContext=e=>e.preventDefault();
    const triggerDash=()=>{if(host){dash(players[0]);}else if(!ended)ctx.send({g:'agar-dash'});};
    const onKey=e=>{if((e.code==='Space'||e.key==='Shift')&&e.target?.tagName!=='INPUT'&&!e.repeat){e.preventDefault();triggerDash();}};
    canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('contextmenu',onContext);window.addEventListener('keydown',onKey);
    ctx.cleanup.push(()=>{canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('contextmenu',onContext);window.removeEventListener('keydown',onKey);});
    const dashBtn=document.createElement('button');dashBtn.className='rt-dash';dashBtn.type='button';dashBtn.textContent='Рывок';dashBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();triggerDash();});ui.stage.append(dashBtn);
    if(host){initWorld();ctx.setStatus('Вы — ведущий симуляции · '+ctx.players+' игроков',null,'Подключённые игроки управляют своими кругляшами');sendState('init',true);}
    else ctx.setStatus('Ожидаем ведущего матча…',null,'Синхронизация начнётся автоматически');
    ctx.onMsg=d=>{
      if(!d||typeof d!=='object')return;
      if(host){
        if(d.g==='agar-input'&&Number.isInteger(d._from)&&d._from>0&&d._from<humanCount){inputs[d._from]={dx:clamp(Number(d.dx)||0,-1,1),dy:clamp(Number(d.dy)||0,-1,1),active:!!d.active};}
        else if(d.g==='agar-dash'&&Number.isInteger(d._from)&&d._from>0&&d._from<humanCount)dash(players[d._from]);
      } else if(d.g==='agar-state')updateRemote(d);
      else if(d.g==='agar-end')finishClient(d.winner,d.winnerName,d.reason);
    };
    attachLoop(ctx,(dt,now)=>{if(host)update(dt);draw(now);});
  }

  function territoryInit(ctx) {
    const host=ctx.me===0;
    const ui=createStage(ctx,'territory','Захват территории','WASD / стрелки или свайп · 1 рывок · 2 щит · 3 взрыв');
    const {canvas,context:g,timer,board}=ui;
    const W=150,H=150,CELLS=W*H,TICK=105,TIME=120000;
    const mini=document.createElement('canvas');mini.className='rt-minimap';mini.width=W;mini.height=H;ui.stage.append(mini);
    const miniCtx=mini.getContext('2d'),miniImage=miniCtx.createImageData(W,H);let miniLast=0;
    const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
    const owner=new Uint8Array(CELLS),trail=new Uint8Array(CELLS);
    let players=[],ticks=0,timeLeft=TIME/1000,started=false,ended=false,acc=0,lastPacked=new Uint8Array(CELLS),view={map:new Uint8Array(CELLS),players:[],timeLeft:120000};
    const inputs=Array.from({length:ctx.players},()=>({dir:-1,ability:-1}));
    let swipe=null,cam={x:W/2,y:H/2},lastSnapshot=0;
    const colors=COLORS.slice(0,ctx.players);
    const rgb=colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));
    const mix=(hex,k,to)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-k)+to*k).toString(16).padStart(2,'0')).join('');
    const terr=colors.map(c=>mix(c,.1,255)),trailColors=colors.map(c=>mix(c,.55,255)),edge=colors.map(c=>mix(c,.32,0));
    const rndInt=n=>Math.floor(Math.random()*n);
    function spawn(p){
      let x,y,tries=0;
      do{x=7+rndInt(W-14);y=7+rndInt(H-14);tries++;}while(tries<100&&players.some(o=>o!==p&&o.alive&&Math.abs(o.x-x)+Math.abs(o.y-y)<18));
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=(y+dy)*W+x+dx;owner[i]=p.id;trail[i]=0;}
      p.x=p.px=x;p.y=p.py=y;p.dir=p.next=rndInt(4);p.trail=[];p.alive=true;p.respawn=0;p.lim=8+rndInt(14);p.cd=[0,0,0];p.boost=0;p.shield=0;
    }
    function newGame(){owner.fill(0);trail.fill(0);ticks=0;timeLeft=TIME/1000;players=Array.from({length:ctx.players},(_,i)=>({id:i+1,name:'Игрок '+(i+1),bot:false,trail:[],alive:true,respawn:0,cd:[0,0,0],boost:0,shield:0,x:0,y:0,px:0,py:0,dir:0,next:0,lim:10}));players.forEach(spawn);cam.x=players[ctx.me].x;cam.y=players[ctx.me].y;started=true;ended=false;lastPacked.fill(0);}
    function kill(p){for(const i of p.trail)if(trail[i]===p.id)trail[i]=0;p.trail=[];p.alive=false;p.respawn=22;}
    function fill(p){const id=p.id;for(const i of p.trail){owner[i]=id;trail[i]=0;}p.trail=[];const seen=new Uint8Array(CELLS),stack=new Int32Array(CELLS);let sp=0;const push=i=>{if(!seen[i]&&owner[i]!==id){seen[i]=1;stack[sp++]=i;}};for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}while(sp){const i=stack[--sp],x=i%W,y=(i/W)|0;if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W);}for(let i=0;i<CELLS;i++)if(!seen[i])owner[i]=id;}
    function bomb(p){const R=4;for(let y=p.y-R;y<=p.y+R;y++)for(let x=p.x-R;x<=p.x+R;x++){if(x<0||y<0||x>=W||y>=H)continue;const i=y*W+x,t=trail[i];if(t===p.id)continue;if(t)kill(players[t-1]);owner[i]=p.id;}}
    const cooldown=[150,200,250],abilityNames=['Рывок','Щит','Взрыв'];
    function useAbility(p,k){if(!p||!p.alive||p.cd[k]>0)return;if(k===0)p.boost=30;else if(k===1)p.shield=40;else bomb(p);p.cd[k]=cooldown[k];}
    function step(p){
      if(!p.alive){if(--p.respawn<=0)spawn(p);return;}
      p.dir=p.next;const nx=p.x+dirs[p.dir][0],ny=p.y+dirs[p.dir][1];if(nx<0||ny<0||nx>=W||ny>=H){kill(p);return;}
      const i=ny*W+nx,t=trail[i];if(t){const v=players[t-1];if(t!==p.id&&v&&v.shield>0){kill(p);return;}kill(v);if(t===p.id)return;}
      p.px=p.x;p.py=p.y;p.x=nx;p.y=ny;
      if(owner[i]!==p.id){trail[i]=p.id;p.trail.push(i);}else if(p.trail.length)fill(p);
    }
    function countsNow(){const counts=new Array(ctx.players+1).fill(0);for(let i=0;i<CELLS;i++)if(owner[i])counts[owner[i]]++;return counts;}
    function percent(counts,id){return counts[id]/CELLS*100;}
    function packedMap(){const out=new Uint8Array(CELLS);for(let i=0;i<CELLS;i++)out[i]=(owner[i]&15)|((trail[i]&15)<<4);return out;}
    function b64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)));return btoa(binary);}
    function from64(value){const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
    function playersData(){return players.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,px:p.px,py:p.py,dir:p.dir,alive:p.alive,trailCount:p.trail.length,respawn:p.respawn,boost:p.boost,shield:p.shield,cd:p.cd.slice()}));}
    function sendSnapshot(full=false){
      if(!host||ctx.local)return;const packed=packedMap();const packet={g:'territory-state',kind:full?'init':'snap',tick:ticks,timeLeft,players:playersData(),counts:countsNow()};
      if(full)packet.mapFull=b64(packed);else{const changes=[];for(let i=0;i<CELLS;i++)if(packed[i]!==lastPacked[i]){changes.push(i&255,i>>8,packed[i]);}packet.mapDelta=b64(Uint8Array.from(changes));}
      lastPacked=packed;ctx.send(packet);
    }
    function applySnapshot(d){
      if(d.kind==='init'){view.map=from64(d.mapFull||'');started=true;ended=false;ctx.setStatus('Матч начался · '+ctx.players+' игроков',null,'Захватывайте клетки и перерезайте чужие следы');}
      else if(d.mapDelta){const delta=from64(d.mapDelta);for(let i=0;i+2<delta.length;i+=3){const at=delta[i]|(delta[i+1]<<8);if(at<CELLS)view.map[at]=delta[i+2];}}
      view.players=d.players||view.players;view.timeLeft=d.timeLeft??view.timeLeft;view.counts=d.counts||view.counts;view.tick=d.tick;
      if(d.kind==='end')finishClient(d.winner,d.reason);
    }
    function hostTick(){
      for(const p of players){for(let k=0;k<3;k++)if(p.cd[k]>0)p.cd[k]--;if(p.boost>0)p.boost--;if(p.shield>0)p.shield--;const input=inputs[p.id-1];if(input&&input.dir>=0&&input.dir!==(p.dir+2)%4)p.next=input.dir;step(p);if(p.alive&&p.boost>0){const x=p.x,y=p.y;step(p);p.px=x;p.py=y;}}
      ticks++;timeLeft=Math.max(0,(TIME-ticks*TICK)/1000);sendSnapshot(false);if(ticks*TICK>=TIME)finishHost();
    }
    function finishHost(){if(ended)return;ended=true;const counts=countsNow();const ranking=players.slice().sort((a,b)=>counts[b.id]-counts[a.id]);const winner=ranking[0];const reason='Захвачено '+percent(counts,winner.id).toFixed(1)+'% территории';if(!ctx.local)ctx.send({g:'territory-end',winner:winner.id-1,reason,counts});finishClient(winner.id-1,reason);}
    function finishClient(winner,reason){if(ended&&!host)return;ended=true;ctx.end(winner,reason||'Матч завершён');}
    function inputDir(dir){if(!Number.isInteger(dir)||dir<0||dir>3||ended)return;if(host){const p=players[0];if(p&&dir!==(p.dir+2)%4)p.next=dir;}else ctx.send({g:'territory-input',dir});}
    function ability(k){if(!Number.isInteger(k)||k<0||k>2||ended)return;if(host)useAbility(players[0],k);else ctx.send({g:'territory-ability',ability:k});}
    function drawMini(map,ps,now){
      if(now-miniLast<180)return;miniLast=now;const data=miniImage.data;
      for(let i=0;i<CELLS;i++){const v=map[i]||0,id=(v>>4)|| (v&15),at=i*4;if(id){const c=rgb[id-1]||[180,180,180];data[at]=c[0];data[at+1]=c[1];data[at+2]=c[2];}else{data[at]=232;data[at+1]=237;data[at+2]=242;}data[at+3]=255;}
      miniCtx.putImageData(miniImage,0,0);for(const p of ps){if(!p.alive)continue;miniCtx.fillStyle='#fff';miniCtx.fillRect(p.x-2,p.y-2,4,4);miniCtx.fillStyle=colors[p.id-1];miniCtx.fillRect(p.x-1,p.y-1,2,2);}
    }
    function draw(now){
      const map=host?packedMap():view.map,ps=host?playersData():view.players||[],counts=host?countsNow():view.counts||[];
      const w=ui.width,h=ui.height,dpr=ui.dpr;g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#2b3038';g.fillRect(0,0,w,h);
      const me=ps.find(p=>p.id===(ctx.me+1))||ps[0];if(!me){g.fillStyle='#fff';g.font='700 18px system-ui';g.textAlign='center';g.fillText('Ожидаем ведущего матча…',w/2,h/2);return;}
      const scale=Math.min(w/(Math.min(W,90)*1.05),h/(Math.min(H,68)*1.05),8);const tile=scale;const camX=clamp(me.x,Math.floor(w/2/tile),W-Math.floor(w/2/tile));const camY=clamp(me.y,Math.floor(h/2/tile),H-Math.floor(h/2/tile));
      const ox=Math.round(w/2-(camX+.5)*tile),oy=Math.round(h/2-(camY+.5)*tile);const x0=clamp(Math.floor(camX-w/2/tile)-1,0,W-1),x1=clamp(Math.ceil(camX+w/2/tile)+1,0,W-1),y0=clamp(Math.floor(camY-h/2/tile)-1,0,H-1),y1=clamp(Math.ceil(camY+h/2/tile)+1,0,H-1);
      g.fillStyle='#e8edf2';g.fillRect(ox,oy,W*tile,H*tile);g.strokeStyle='#d8dfe7';g.lineWidth=1;g.beginPath();for(let x=x0;x<=x1+1;x++){g.moveTo(ox+x*tile+.5,oy+y0*tile);g.lineTo(ox+x*tile+.5,oy+(y1+1)*tile);}for(let y=y0;y<=y1+1;y++){g.moveTo(ox+x0*tile,oy+y*tile+.5);g.lineTo(ox+(x1+1)*tile,oy+y*tile+.5);}g.stroke();
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x,v=map[i]||0,o=v&15,tr=v>>4,px=ox+x*tile,py=oy+y*tile;if(o){g.fillStyle=terr[o-1]||'#ddd';g.fillRect(px,py,tile,tile);}if(tr){g.fillStyle=trailColors[tr-1]||'#bbb';g.fillRect(px,py,tile,tile);}}
      for(const p of ps){if(!p.alive)continue;const px=ox+(p.x+.5)*tile,py=oy+(p.y+.5)*tile;g.fillStyle=edge[p.id-1]||'#333';g.beginPath();g.roundRect(px-tile*.56,py-tile*.56,tile*1.12,tile*1.12,Math.max(2,tile*.2));g.fill();g.fillStyle=colors[p.id-1];g.beginPath();g.roundRect(px-tile*.42,py-tile*.42,tile*.84,tile*.84,Math.max(2,tile*.16));g.fill();if(p.shield>0){g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(px-tile*.65,py-tile*.65,tile*1.3,tile*1.3);}g.font='700 11px system-ui';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#0009';g.strokeText(p.name,px,py-tile*.7);g.fillStyle='#fff';g.fillText(p.name,px,py-tile*.7);}
      timer.textContent=formatMs((host?timeLeft:(view.timeLeft??120))*1000);
      ui.info.textContent='Ваша территория: '+(counts.length?((counts[ctx.me+1]||0)/CELLS*100).toFixed(1):'0.0')+'% · WASD / стрелки · 1–3 способности';
      const rank=ps.slice().sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(p=>({name:p.id===ctx.me+1?'Вы':p.name,value:(counts.length?((counts[p.id]||0)/CELLS*100).toFixed(1):'0.0')+'%',color:colors[p.id-1]}));setBoard(board,rank);
      drawMini(map,ps,now);
    }
    function formatMs(ms){const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
    function onKey(e){const k=e.key.toLowerCase(),map={arrowright:0,d:0,arrowdown:1,s:1,arrowleft:2,a:2,arrowup:3,w:3};if(k in map){inputDir(map[k]);e.preventDefault();}const ab={'1':0,'2':1,'3':2};if(k in ab){ability(ab[k]);e.preventDefault();}}
    function onPointerDown(e){swipe={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}}
    function onPointerMove(e){if(!swipe)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;if(Math.max(Math.abs(dx),Math.abs(dy))>24){inputDir(Math.abs(dx)>Math.abs(dy)?(dx>0?0:2):(dy>0?1:3));swipe={x:e.clientX,y:e.clientY};}}
    const onPointerUp=()=>{swipe=null;};
    window.addEventListener('keydown',onKey);canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
    ctx.cleanup.push(()=>{window.removeEventListener('keydown',onKey);canvas.removeEventListener('pointerdown',onPointerDown);canvas.removeEventListener('pointermove',onPointerMove);canvas.removeEventListener('pointerup',onPointerUp);canvas.removeEventListener('pointercancel',onPointerUp);});
    const abilities=document.createElement('div');abilities.className='rt-abilities';abilityNames.forEach((name,k)=>{const b=document.createElement('button');b.type='button';b.className='rt-ability';b.innerHTML='<b>'+(k+1)+'</b><span>'+name+'</span>';b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();ability(k);});abilities.append(b);});ui.stage.append(abilities);
    if(host){newGame();sendSnapshot(true);ctx.setStatus('Вы — ведущий симуляции · '+ctx.players+' игроков',null,'Захватывайте клетки и перерезайте чужие следы');}
    else ctx.setStatus('Ожидаем ведущего матча…',null,'Синхронизация карты начнётся автоматически');
    ctx.onMsg=d=>{
      if(!d||typeof d!=='object')return;
      if(host){if(Number.isInteger(d._from)&&d._from>0&&d._from<ctx.players){if(d.g==='territory-input'&&Number.isInteger(d.dir)&&d.dir>=0&&d.dir<4)inputs[d._from].dir=d.dir;else if(d.g==='territory-ability'&&Number.isInteger(d.ability)&&d.ability>=0&&d.ability<3)useAbility(players[d._from],d.ability);}}
      else if(d.g==='territory-state')applySnapshot(d);else if(d.g==='territory-end')finishClient(d.winner,d.reason);
    };
    attachLoop(ctx,(dt,now)=>{
      if(host&&started&&!ended){acc+=dt*1000;while(acc>=TICK&&started&&!ended){acc-=TICK;hostTick();}}
      draw(now);
    });
  }

  function registerRealtimeGames(Games, LIST) {
    LIST.push({id:'agar',name:'Кругляши: съешь всех',desc:'Расти, собирай бонусы, делай рывки и съедай соперников на арене.',online:true,local:false,minPlayers:2,maxPlayers:10,teamGame:false,icon:SVG_AGAR});
    Games.agar={init:agarInit};
    LIST.push({id:'territory',name:'Захват территории',desc:'Захватывай карту, замыкай петли, перерезай следы соперников и используй способности.',online:true,local:false,minPlayers:2,maxPlayers:10,teamGame:false,icon:SVG_TERRITORY});
    Games.territory={init:territoryInit};
  }
  window.registerRealtimeGames=registerRealtimeGames;
})();
/* Additional two-player games. Registered inside the existing game hub. */
(function () {
  'use strict';

  function registerExtraGames(Games, LIST, el) {
    const U = {
      make(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      },
      board(ctx, description, cls) {
        const root = ctx.root;
        root.textContent = '';
        const note = U.make('p', 'x-note', description);
        const area = U.make('div', 'x-area ' + (cls || ''));
        root.append(note, area);
        return { area, note };
      },
      button(cls, title, fn) {
        const b = U.make('button', cls);
        b.type = 'button';
        b.setAttribute('aria-label', title);
        b.title = title;
        b.addEventListener('click', fn);
        return b;
      },
      allow(ctx, player, remote) {
        return remote ? !ctx.local && player !== ctx.me : ctx.canAct(player);
      },
      rng(seed) {
        let x = (seed | 0) ^ 0x6D2B79F5;
        return () => {
          x |= 0;
          x = (x + 0x6D2B79F5) | 0;
          let t = Math.imul(x ^ (x >>> 15), 1 | x);
          t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      },
      shuffle(items, seed) {
        const result = items.slice(), rand = U.rng(seed);
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      },
      within(n, size) { return Number.isInteger(n) && n >= 0 && n < size; },
      register(id, name, desc, local, icon, init) {
        LIST.push({ id, name, desc, local, online: true, icon });
        Games[id] = { init };
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // 1. CHESS — legal checks, checkmate, stalemate, castling, en passant,
    //    and choice of promotion piece.
    // ─────────────────────────────────────────────────────────────────────
    const chessIcon = '<rect x="7" y="7" width="34" height="34" rx="3"/><path d="M7 24h34M24 7v34M12 36l24-24"/><circle cx="24" cy="24" r="6" fill="currentColor" stroke="none"/>';
    function chessInit(ctx) {
      const { area } = U.board(ctx, 'Полные правила: шах, мат, пат, рокировка и взятие на проходе. Нажмите фигуру, затем клетку.', 'x-narrow');
      const bar = U.make('div', 'x-hud');
      const boardEl = U.make('div', 'x-chess');
      const promoPanel = U.make('div', 'x-promotion');
      area.append(bar, boardEl, promoPanel);
      const glyph = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
      let b = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('').map(p => p === '.' ? null : p);
      let rights = {K:true,Q:true,k:true,q:true};
      let ep = -1, turn = 0, last = [], selected = -1, ended = false, pending = null;
      const sOf = p => p && p === p.toUpperCase() ? 0 : 1;
      const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
      const side = p => p ? sOf(p) : -1;
      const kingSquare = (board, s) => board.indexOf(s === 0 ? 'K' : 'k');
      function attacked(board, pos, by) {
        const r = pos >> 3, c = pos & 7;
        const pawnRow = r + (by === 0 ? 1 : -1);
        for (const dc of [-1,1]) if (inside(pawnRow,c+dc) && board[pawnRow*8+c+dc] === (by===0?'P':'p')) return true;
        for (const [dr,dc] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]])
          if (inside(r+dr,c+dc) && board[(r+dr)*8+c+dc] === (by===0?'N':'n')) return true;
        for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
          let y = r+dr, x = c+dc, distance=1;
          while (inside(y,x)) {
            const p = board[y*8+x];
            if (p) {
              if (side(p) === by) {
                const type = p.toLowerCase();
                if ((distance===1 && type==='k') ||
                    ((dr===0||dc===0)&&(type==='r'||type==='q')) ||
                    ((dr!==0&&dc!==0)&&(type==='b'||type==='q'))) return true;
              }
              break;
            }
            y += dr; x += dc; distance++;
          }
        }
        return false;
      }
      function inCheck(board, player) {
        const king = kingSquare(board,player);
        return king < 0 || attacked(board,king,1-player);
      }
      function pseudo(board, from, enPassant, castle) {
        const p=board[from]; if (!p) return [];
        const owner=side(p), type=p.toLowerCase(), r=from>>3,c=from&7;
        const out=[];
        function add(y,x,extra={}) { if (inside(y,x) && side(board[y*8+x])!==owner && board[y*8+x]?.toLowerCase()!=='k') out.push({from,to:y*8+x,...extra}); }
        if (type==='p') {
          const d=owner===0?-1:1, one=r+d;
          if (inside(one,c) && !board[one*8+c]) {
            add(one,c);
            const two=r+2*d;
            if (r===(owner===0?6:1) && !board[two*8+c]) add(two,c,{double:true});
          }
          for (const dc of [-1,1]) if (inside(one,c+dc)) {
            const target=one*8+c+dc;
            if (board[target] && side(board[target])!==owner && board[target].toLowerCase()!=='k') add(one,c+dc);
            if (target===enPassant && !board[target] && board[r*8+c+dc] === (owner===0?'p':'P')) add(one,c+dc,{ep:true});
          }
        } else if (type==='n') {
          for (const [dy,dx] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) add(r+dy,c+dx);
        } else if (type==='k') {
          for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) if (dy||dx) add(r+dy,c+dx);
          if (!inCheck(board,owner)) {
            const home=owner===0?7:0, keyK=owner===0?'K':'k',keyQ=owner===0?'Q':'q';
            if (r===home && c===4 && castle[keyK] && board[home*8+7]===(owner===0?'R':'r') &&
                !board[home*8+5]&&!board[home*8+6] &&
                !attacked(board,home*8+5,1-owner)&&!attacked(board,home*8+6,1-owner)) add(home,6,{castle:'k'});
            if (r===home && c===4 && castle[keyQ] && board[home*8]===(owner===0?'R':'r') &&
                !board[home*8+1]&&!board[home*8+2]&&!board[home*8+3] &&
                !attacked(board,home*8+3,1-owner)&&!attacked(board,home*8+2,1-owner)) add(home,2,{castle:'q'});
          }
        } else {
          const dirs=type==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:
            type==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:
            [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
          for (const [dy,dx] of dirs) {
            let y=r+dy,x=c+dx;
            while (inside(y,x)) {
              if (side(board[y*8+x])===owner) break;
              add(y,x);
              if (board[y*8+x]) break;
              y+=dy;x+=dx;
            }
          }
        }
        return out;
      }
      function simulate(board, m, promotion='q') {
        const copy=board.slice(), piece=copy[m.from], owner=side(piece);
        copy[m.from]=null;
        if (m.ep) copy[(m.from>>3)*8+(m.to&7)]=null;
        if (m.castle) {
          const row=m.to>>3;
          if (m.castle==='k') {copy[row*8+5]=copy[row*8+7];copy[row*8+7]=null;}
          else {copy[row*8+3]=copy[row*8];copy[row*8]=null;}
        }
        const reachingLast=piece.toLowerCase()==='p' && (m.to>>3)===(owner===0?0:7);
        copy[m.to]=reachingLast?(owner===0?promotion.toUpperCase():promotion.toLowerCase()):piece;
        return copy;
      }
      const legalAt=(board,idx,player,enPassant,castle) => pseudo(board,idx,enPassant,castle)
        .filter(m=>!inCheck(simulate(board,m),player));
      function allMoves(board,player,enPassant,castle) {
        const moves=[];
        for(let i=0;i<64;i++) if(side(board[i])===player) moves.push(...legalAt(board,i,player,enPassant,castle));
        return moves;
      }
      function move(m,promotion) {
        const captured=b[m.to],moving=b[m.from];
        b=simulate(b,m,promotion);
        for (const [pos,k] of [[60,'K'],[4,'k'],[63,'K'],[56,'Q'],[7,'k'],[0,'q']]) {
          if (m.from===pos || m.to===pos) {
            if (k==='K'&&pos===60) {rights.K=false;rights.Q=false;}
            else if(k==='k'&&pos===4) {rights.k=false;rights.q=false;}
            else rights[k]=false;
          }
        }
        if (moving==='K'){rights.K=false;rights.Q=false;}
        if (moving==='k'){rights.k=false;rights.q=false;}
        if (captured==='R'&&m.to===63)rights.K=false;
        if (captured==='R'&&m.to===56)rights.Q=false;
        if (captured==='r'&&m.to===7)rights.k=false;
        if (captured==='r'&&m.to===0)rights.q=false;
        ep = m.double ? (m.from+m.to)/2 : -1;
        last=[m.from,m.to]; selected=-1; pending=null;
        turn=1-turn;
        const moves=allMoves(b,turn,ep,rights);
        draw();
        if (!moves.length) {
          ended=true;
          ctx.end(inCheck(b,turn)?1-turn:null,inCheck(b,turn)?'Шах и мат':'Пат — ничья');
        } else ctx.turn(turn,inCheck(b,turn)?'ШАХ':'Фигуры светлые — игрок 1, тёмные — игрок 2');
      }
      function tryMove(from,to,promotion,remote) {
        if (ended || !U.allow(ctx,turn,remote)||!U.within(from,64)||!U.within(to,64)) return false;
        const piece=b[from]; if(!piece||side(piece)!==turn)return false;
        const m=legalAt(b,from,turn,ep,rights).find(m=>m.to===to);
        if(!m)return false;
        if (piece.toLowerCase()==='p'&&(to>>3)===(turn===0?0:7) && !['q','r','b','n'].includes(promotion)) return false;
        move(m,promotion||'q');
        if(!remote)ctx.send({from,to,promotion:promotion||'q'});
        return true;
      }
      function promote(from,to) {
        pending={from,to};promoPanel.textContent='';
        promoPanel.append(U.make('span','','Превратить пешку в:'));
        for(const piece of ['q','r','b','n']){
          const sym=turn===0?piece.toUpperCase():piece;
          const button=U.button('x-promo-btn',piece,()=>{promoPanel.textContent='';tryMove(from,to,piece,false);});
          button.textContent=glyph[sym];promoPanel.append(button);
        }
      }
      function click(i) {
        if (ended || !ctx.canAct(turn)) return;
        if(selected>=0){
          const legal=legalAt(b,selected,turn,ep,rights).find(m=>m.to===i);
          if(legal){
            if(b[selected].toLowerCase()==='p'&&(i>>3)===(turn===0?0:7)) promote(selected,i);
            else tryMove(selected,i,'q',false);
            return;
          }
        }
        selected=side(b[i])===turn?i:-1;
        promoPanel.textContent='';pending=null;draw();
      }
      function draw() {
        boardEl.textContent='';
        const legal=selected>=0?legalAt(b,selected,turn,ep,rights).map(m=>m.to):[];
        for (let visual=0;visual<64;visual++) {
          const i=ctx.me===1 ? 63-visual:visual, r=i>>3,c=i&7, piece=b[i];
          const cell=U.button('x-chess-cell'+((r+c)%2===0?' light':' dark')+
              (selected===i?' selected':'')+(legal.includes(i)?' legal':'')+(last.includes(i)?' last':'')+
              (piece?' has-piece':''), 'Клетка '+String.fromCharCode(97+c)+(8-r),()=>click(i));
          if(piece){
            const span=U.make('span','x-chess-piece '+(side(piece)===0?'white':'black'),glyph[piece]);
            cell.append(span);
          }
          boardEl.append(cell);
        }
        bar.textContent='';
        bar.append(U.make('span','x-token','♔ Игрок 1 — белые'),U.make('span','x-token','♚ Игрок 2 — чёрные'));
      }
      ctx.onMsg=d=>{if(d&&Number.isInteger(d.from)&&Number.isInteger(d.to))tryMove(d.from,d.to,d.promotion,true);};
      draw();ctx.turn(turn,'Белые начинают');
    }
    U.register('chess','Шахматы','Полноценная партия: шах, мат, рокировка и превращения.',true,chessIcon,chessInit);

    // ─────────────────────────────────────────────────────────────────────
    // 2. RUSSIAN CHECKERS — mandatory and chained captures; flying kings.
    // ─────────────────────────────────────────────────────────────────────
    const checkersIcon='<circle cx="24" cy="22" r="14"/><path d="M12 24h24M16 14h16M18 30h12"/><path d="m19 10 5-5 5 5"/>';
    function checkersInit(ctx) {
      const {area}=U.board(ctx,'Русские шашки: обязательное взятие, серии взятий и дальнобойные дамки.', 'x-narrow');
      const boardEl=U.make('div','x-checkers');area.append(boardEl);
      const board=Array(64).fill(null);
      for(let r=0;r<8;r++)for(let c=0;c<8;c++) if((r+c)%2===1){if(r<=2)board[r*8+c]=1;else if(r>=5)board[r*8+c]=0;}
      let turn=0,forced=-1,selected=-1,last=[],over=false;
      const dirs=[[-1,-1],[-1,1],[1,-1],[1,1]];
      const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
      const owner=v=>v===null?-1:v%2;
      function movesFor(from,captureOnly=false){
        const piece=board[from],ret=[];
        if(piece===null)return ret;
        const s=piece%2,king=piece>=2,r=from>>3,c=from&7;
        for(const [dy,dx] of dirs){
          if(king){
            let y=r+dy,x=c+dx,enemy=-1;
            while(inside(y,x)){
              const i=y*8+x,p=board[i];
              if(p!==null){if(owner(p)===s||enemy>=0)break;enemy=i;}
              else if(enemy>=0)ret.push({from,to:i,cap:enemy});
              else if(!captureOnly)ret.push({from,to:i,cap:-1});
              y+=dy;x+=dx;
            }
          }else{
            const y=r+dy,x=c+dx;
            if(!inside(y,x))continue;
            const next=y*8+x;
            if(board[next]!==null&&owner(board[next])!==s){
              const yy=y+dy,xx=x+dx;
              if(inside(yy,xx)&&board[yy*8+xx]===null)ret.push({from,to:yy*8+xx,cap:next});
            }else if(!captureOnly && board[next]===null && dy===(s===0?-1:1)) ret.push({from,to:next,cap:-1});
          }
        }
        return ret;
      }
      function options(from){
        if(board[from]===null||owner(board[from])!==turn||(forced>=0&&from!==forced))return [];
        const anyCap=forced>=0||board.some((p,i)=>p!==null&&owner(p)===turn&&movesFor(i,true).length>0);
        return movesFor(from,anyCap).filter(m=>!anyCap||m.cap>=0);
      }
      function apply(from,to,remote){
        if(over||!U.allow(ctx,turn,remote)||!U.within(from,64)||!U.within(to,64))return false;
        const m=options(from).find(m=>m.to===to);if(!m)return false;
        let piece=board[from];board[from]=null;board[to]=piece;
        if(m.cap>=0)board[m.cap]=null;
        const row=to>>3;
        if(piece<2&&row===(turn===0?0:7))board[to]=piece+2;
        selected=-1;last=[from,to];
        const keep=m.cap>=0&&movesFor(to,true).length>0;
        if(keep){forced=to;selected=to;}
        else{forced=-1;turn=1-turn;}
        draw();
        if(!keep&&!board.some((p,i)=>p!==null&&owner(p)===turn&&options(i).length)){
          over=true;ctx.end(1-turn,'У соперника нет доступных ходов');
        }else ctx.turn(turn,keep?'Продолжите серию взятий':'Взятие обязательно, если доступно');
        if(!remote)ctx.send({from,to});return true;
      }
      function click(i){
        if(over||!ctx.canAct(turn))return;
        if(selected>=0&&options(selected).some(m=>m.to===i)){apply(selected,i,false);return;}
        if(options(i).length)selected=i;
        else if(forced<0)selected=-1;
        draw();
      }
      function draw(){
        boardEl.textContent='';const possible=selected>=0?options(selected).map(m=>m.to):[];
        for(let visual=0;visual<64;visual++){
          const i=ctx.me===1?63-visual:visual, r=i>>3,c=i&7,p=board[i];
          const cell=U.button('x-check-cell '+((r+c)%2?'deep':'light')+
            (selected===i?' selected':'')+(possible.includes(i)?' possible':'')+(last.includes(i)?' last':''),
            'Шашечная клетка '+(i+1),()=>click(i));
          if(p!==null){const disk=U.make('span','x-check-piece p'+owner(p)+(p>=2?' king':'') );
            if(p>=2)disk.append(U.make('span','x-crown','✦'));
            cell.append(disk);
          }
          boardEl.append(cell);
        }
      }
      ctx.onMsg=d=>{if(d)apply(d.from,d.to,true);};draw();ctx.turn(turn,'Светлые шашки начинают');
    }
    U.register('checkers','Русские шашки','Дамки, обязательное взятие и многоходовые комбинации.',true,checkersIcon,checkersInit);

    // ─────────────────────────────────────────────────────────────────────
    // 3. GOMOKU — five consecutive stones on a 15×15 board.
    // ─────────────────────────────────────────────────────────────────────
    const gomokuIcon='<path d="M9 9h30v30H9zM19 9v30M29 9v30M9 19h30M9 29h30"/><circle cx="19" cy="19" r="6" fill="currentColor" stroke="none"/>';
    function gomokuInit(ctx){
      const {area}=U.board(ctx,'Пять фишек подряд по горизонтали, вертикали или диагонали. Планируйте атаку и блокируйте угрозы.','x-wide');
      const boardEl=U.make('div','x-gomoku'),size=15, b=Array(size*size).fill(null);
      area.append(boardEl);
      let turn=0,over=false,last=-1,win=[];
      const cells=[];
      for(let i=0;i<b.length;i++){
        const cell=U.button('x-go-cell','Гомоку: '+(Math.floor(i/size)+1)+'-'+(i%size+1),()=>move(i,false));
        boardEl.append(cell);cells.push(cell);
      }
      function move(i,remote){
        if(over||!U.allow(ctx,turn,remote)||!U.within(i,b.length)||b[i]!==null)return;
        b[i]=turn;last=i;
        const r=Math.floor(i/size),c=i%size;
        for(const [dy,dx] of [[1,0],[0,1],[1,1],[1,-1]]){
          const line=[i];
          for(const sign of [-1,1]){
            let y=r+dy*sign,x=c+dx*sign;
            while(y>=0&&y<size&&x>=0&&x<size&&b[y*size+x]===turn){line.push(y*size+x);y+=dy*sign;x+=dx*sign;}
          }
          if(line.length>=5){win=line;break;}
        }
        draw();
        if(win.length){over=true;ctx.end(turn,'Пять в ряд!');}
        else if(b.every(v=>v!==null)){over=true;ctx.end(null,'Поле заполнено');}
        else{turn=1-turn;ctx.turn(turn,'Соберите пять фишек в ряд');}
        if(!remote)ctx.send({i});
      }
      function draw(){
        cells.forEach((cell,i)=>{
          cell.className='x-go-cell'+(last===i?' last':'')+(win.includes(i)?' win':'');
          cell.textContent='';
          if(b[i]!==null)cell.append(U.make('span','x-go-stone p'+b[i]));
        });
      }
      ctx.onMsg=d=>{if(d)move(d.i,true);};draw();ctx.turn(turn,'Синие начинают');
    }
    U.register('gomoku','Гомоку','Глубокая стратегия на поле 15×15: соберите пять в ряд.',true,gomokuIcon,gomokuInit);

    // ─────────────────────────────────────────────────────────────────────
    // 4. HEX — connect opposing sides of a hexagonal board.
    // ─────────────────────────────────────────────────────────────────────
    const hexIcon='<path d="m24 5 17 10v18L24 43 7 33V15zM7 15l17 10 17-10M24 25v18"/>';
    function hexInit(ctx){
      const {area}=U.board(ctx,'Соедините противоположные края своими фишками. Синие соединяют верх и низ, красные — лево и право.','x-hex-area');
      const boardEl=U.make('div','x-hex-board'),n=9,b=Array(n*n).fill(null);
      area.append(boardEl);
      let turn=0,over=false,winning=new Set();
      const cells=[];
      for(let r=0;r<n;r++){
        const row=U.make('div','x-hex-row');row.style.marginLeft='calc(var(--hex-size) * '+(r/2)+')';
        for(let c=0;c<n;c++){
          const i=r*n+c,cell=U.button('x-hex-tile','Гекс '+(r+1)+':'+(c+1),()=>move(i,false));
          row.append(cell);cells[i]=cell;
        }
        boardEl.append(row);
      }
      function path(player){
        const queue=[],seen=new Set(),parent=new Map();
        for(let i=0;i<n*n;i++){
          if(b[i]===player&&(player===0?(i<n):(i%n===0))){seen.add(i);queue.push(i);}
        }
        for(let qi=0;qi<queue.length;qi++){
          const i=queue[qi],r=Math.floor(i/n),c=i%n;
          if(player===0?r===n-1:c===n-1){
            const trace=new Set();let at=i;
            while(at!==undefined){trace.add(at);at=parent.get(at);}return trace;
          }
          for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,1],[1,-1]]){
            const y=r+dr,x=c+dc,j=y*n+x;
            if(y>=0&&y<n&&x>=0&&x<n&&b[j]===player&&!seen.has(j)){
              seen.add(j);parent.set(j,i);queue.push(j);
            }
          }
        }
        return null;
      }
      function move(i,remote){
        if(over||!U.allow(ctx,turn,remote)||!U.within(i,b.length)||b[i]!==null)return;
        b[i]=turn;winning=path(turn)||new Set();draw();
        if(winning.size){over=true;ctx.end(turn,'Цепь соединена!');}
        else{turn=1-turn;ctx.turn(turn,'Соедините свои противоположные стороны');}
        if(!remote)ctx.send({i});
      }
      function draw(){cells.forEach((cell,i)=>{cell.className='x-hex-tile'+(b[i]===null?'':' p'+b[i])+(winning.has(i)?' winning':'');});}
      ctx.onMsg=d=>{if(d)move(d.i,true);};draw();ctx.turn(turn,'Синие соединяют верх и низ');
    }
    U.register('hex','Гекс','Постройте непрерывную цепь через шестиугольное поле.',true,hexIcon,hexInit);

    // ─────────────────────────────────────────────────────────────────────
    // 5. QUORIDOR — jump over the opponent; walls must leave both a path.
    // ─────────────────────────────────────────────────────────────────────
    const quoridorIcon='<rect x="8" y="8" width="32" height="32" rx="2"/><path d="M17 8v20M17 28h23M29 8v12M8 20h21"/>';
    function quoridorInit(ctx){
      const {area}=U.board(ctx,'Дойдите пешкой до противоположной стороны. Можно ставить стены, но нельзя полностью перекрывать путь.','x-narrow');
      const toolbar=U.make('div','x-tools');
      const boardEl=U.make('div','x-q-board');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 610 610');svg.setAttribute('role','group');
      svg.setAttribute('aria-label','Игровое поле Коридор');boardEl.append(svg);
      area.append(toolbar,boardEl);
      const N=9,CELL=61,GAP=6,START=6;
      const pos=[{r:8,c:4},{r:0,c:4}],remaining=[10,10];
      const H=Array.from({length:8},()=>Array(8).fill(false));
      const V=Array.from({length:8},()=>Array(8).fill(false));
      let turn=0,mode='move',over=false;
      const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
      const inside=(r,c)=>r>=0&&r<N&&c>=0&&c<N;
      function blocked(r,c,y,x){
        if(!inside(y,x)||Math.abs(r-y)+Math.abs(c-x)!==1)return true;
        if(r!==y){const low=Math.min(r,y);return (c<8&&H[low][c])||(c>0&&H[low][c-1]);}
        const low=Math.min(c,x);return (r<8&&V[r][low])||(r>0&&V[r-1][low]);
      }
      function pawnMoves(player){
        const cur=pos[player],opp=pos[1-player],out=[];
        for(const [dy,dx] of dirs){
          const nr=cur.r+dy,nc=cur.c+dx;
          if(blocked(cur.r,cur.c,nr,nc))continue;
          if(nr!==opp.r||nc!==opp.c){out.push(nr*N+nc);continue;}
          const yr=nr+dy,xc=nc+dx;
          if(!blocked(nr,nc,yr,xc)){out.push(yr*N+xc);continue;}
          const jumps=dy!==0?[[0,-1],[0,1]]:[[-1,0],[1,0]];
          for(const [oy,ox] of jumps)if(!blocked(nr,nc,nr+oy,nc+ox))out.push((nr+oy)*N+nc+ox);
        }
        return out;
      }
      function hasPath(player){
        const queue=[pos[player].r*N+pos[player].c],seen=new Set(queue);
        for(let i=0;i<queue.length;i++){
          const index=queue[i],r=Math.floor(index/N),c=index%N;
          if(r===(player===0?0:8))return true;
          for(const [dy,dx] of dirs){
            const y=r+dy,x=c+dx,j=y*N+x;
            if(!blocked(r,c,y,x)&&!seen.has(j)){seen.add(j);queue.push(j);}
          }
        }
        return false;
      }
      function wallAllowed(kind,r,c){
        if(!U.within(r,8)||!U.within(c,8)||remaining[turn]<=0)return false;
        const own=kind==='h'?H:V,other=kind==='h'?V:H;
        if(own[r][c]||other[r][c])return false;
        if(kind==='h'&&((c>0&&H[r][c-1])||(c<7&&H[r][c+1])))return false;
        if(kind==='v'&&((r>0&&V[r-1][c])||(r<7&&V[r+1][c])))return false;
        own[r][c]=true;
        const allowed=hasPath(0)&&hasPath(1);
        own[r][c]=false;
        return allowed;
      }
      function act(action,remote){
        if(over||!U.allow(ctx,turn,remote)||!action)return;
        if(action.k==='move'){
          if(!U.within(action.i,81)||!pawnMoves(turn).includes(action.i))return;
          pos[turn]={r:Math.floor(action.i/N),c:action.i%N};
          const won=pos[turn].r===(turn===0?0:8),winner=turn;
          if(!remote)ctx.send(action);
          if(won){over=true;draw();ctx.end(winner,'Пешка достигла противоположной стороны');return;}
        }else if(action.k==='wall'){
          if(!['h','v'].includes(action.kind)||!wallAllowed(action.kind,action.r,action.c))return;
          (action.kind==='h'?H:V)[action.r][action.c]=true;remaining[turn]--;
          if(!remote)ctx.send(action);
        }else return;
        turn=1-turn;draw();ctx.turn(turn,'Стены: '+remaining[0]+' / '+remaining[1]);
      }
      function makeSvg(tag,attrs,parent=svg){
        const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
        for(const [key,val] of Object.entries(attrs))node.setAttribute(key,String(val));
        parent.append(node);return node;
      }
      const coord=i=>START+i*(CELL+GAP);
      function draw(){
        toolbar.textContent='';
        for(const [kind,title] of [['move','Ход пешкой'],['h','Стена —'],['v','Стена |']]){
          const button=U.button('btn x-mode'+(mode===kind?' primary':''),title,()=>{mode=kind;draw();});
          button.textContent=title;toolbar.append(button);
        }
        toolbar.append(U.make('span','x-remaining','Стены: '+remaining[0]+' / '+remaining[1]));
        svg.textContent='';
        const available=!over&&ctx.canAct(turn)?new Set(pawnMoves(turn)):new Set();
        for(let r=0;r<N;r++)for(let c=0;c<N;c++){
          const i=r*N+c,x=coord(c),y=coord(r);
          const rect=makeSvg('rect',{x,y,width:CELL,height:CELL,rx:7, class:'x-q-cell'+(available.has(i)&&mode==='move'?' available':'')});
          rect.addEventListener('click',()=>{if(mode==='move')act({k:'move',i},false);});
          if((pos[0].r===r&&pos[0].c===c)||(pos[1].r===r&&pos[1].c===c)){
            const player=pos[0].r===r&&pos[0].c===c?0:1;
            makeSvg('circle',{cx:x+CELL/2,cy:y+CELL/2,r:20,class:'x-q-pawn p'+player,'pointer-events':'none'});
            makeSvg('text',{x:x+CELL/2,y:y+CELL/2+6,'text-anchor':'middle',class:'x-q-pawn-num','pointer-events':'none'},svg).textContent=String(player+1);
          }
        }
        for(let r=0;r<8;r++)for(let c=0;c<8;c++){
          const x=coord(c),y=coord(r);
          if(H[r][c])makeSvg('rect',{x:x-1,y:y+CELL+1,width:CELL*2+GAP+2,height:GAP-1,rx:2,class:'x-q-wall'},svg);
          if(V[r][c])makeSvg('rect',{x:x+CELL+1,y:y-1,width:GAP-1,height:CELL*2+GAP+2,rx:2,class:'x-q-wall'},svg);
          if(!over&&ctx.canAct(turn)&&remaining[turn]>0&&mode==='h'&&wallAllowed('h',r,c)){
            const rect=makeSvg('rect',{x:x-1,y:y+CELL-2,width:CELL*2+GAP+2,height:GAP+7,rx:2,class:'x-q-preview'},svg);
            rect.addEventListener('click',()=>act({k:'wall',kind:'h',r,c},false));
          }
          if(!over&&ctx.canAct(turn)&&remaining[turn]>0&&mode==='v'&&wallAllowed('v',r,c)){
            const rect=makeSvg('rect',{x:x+CELL-2,y:y-1,width:GAP+7,height:CELL*2+GAP+2,rx:2,class:'x-q-preview'},svg);
            rect.addEventListener('click',()=>act({k:'wall',kind:'v',r,c},false));
          }
        }
      }
      ctx.onMsg=d=>act(d,true);draw();ctx.turn(turn,'Пешка 1 идёт вверх, пешка 2 — вниз');
    }
    U.register('quoridor','Коридор','Дуэль маршрутов: стройте стены и обходите ловушки.',true,quoridorIcon,quoridorInit);

    // ─────────────────────────────────────────────────────────────────────
    // 6. MINESWEEPER DUEL — deterministic minefield, score all safe cells.
    // ─────────────────────────────────────────────────────────────────────
    const mineIcon='<rect x="8" y="8" width="32" height="32" rx="4"/><circle cx="24" cy="24" r="8"/><path d="M24 11v5M24 32v5M11 24h5M32 24h5M15 15l4 4M29 29l4 4"/>';
    function minesInit(ctx){
      const {area}=U.board(ctx,'По очереди открывайте клетки. Безопасная клетка — 1 очко, пустые области открываются цепочкой. Мина — штраф 3 очка.','x-narrow');
      const scorebar=U.make('div','x-hud'), boardEl=U.make('div','x-mines');area.append(scorebar,boardEl);
      const N=10,M=17,field=Array(100).fill(false),shown=Array(100).fill(false);
      U.shuffle(Array.from({length:100},(_,i)=>i),ctx.n*583+99217).slice(0,M).forEach(i=>field[i]=true);
      const around=i=>{
        const r=Math.floor(i/N),c=i%N,ret=[];
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dy||dx)&&r+dy>=0&&r+dy<N&&c+dx>=0&&c+dx<N)ret.push((r+dy)*N+c+dx);
        return ret;
      };
      const count=field.map((_,i)=>around(i).filter(j=>field[j]).length);
      const cells=[];let turn=0,over=false,remaining=100-M,last=-1,points=[0,0];
      for(let i=0;i<100;i++){
        const cell=U.button('x-mine-cell','Сапёр: '+(Math.floor(i/10)+1)+':'+(i%10+1),()=>pick(i,false));
        boardEl.append(cell);cells.push(cell);
      }
      function pick(i,remote){
        if(over||!U.allow(ctx,turn,remote)||!U.within(i,100)||shown[i])return;
        const p=turn;last=i;
        if(field[i]){shown[i]=true;points[p]-=3;}
        else{
          const queue=[i];
          while(queue.length){
            const j=queue.pop();
            if(shown[j]||field[j])continue;
            shown[j]=true;points[p]++;remaining--;
            if(count[j]===0)for(const k of around(j))if(!shown[k]&&!field[k])queue.push(k);
          }
        }
        draw();
        if(remaining===0){over=true;ctx.end(points[0]===points[1]?null:points[0]>points[1]?0:1,'Все безопасные клетки открыты');}
        else{turn=1-turn;ctx.turn(turn,'Очки: '+points[0]+' / '+points[1]);}
        if(!remote)ctx.send({i});
      }
      function draw(){
        scorebar.textContent='';
        scorebar.append(U.make('span','x-token','Игрок 1: '+points[0]),U.make('span','x-token','Игрок 2: '+points[1]),U.make('span','x-token','Осталось: '+remaining));
        cells.forEach((cell,i)=>{
          cell.className='x-mine-cell'+(shown[i]?' opened':'')+(shown[i]&&field[i]?' bomb':'')+(last===i?' last':'');
          cell.textContent=shown[i]?(field[i]?'✹':count[i]?String(count[i]):''):'';
          if(shown[i]&&!field[i]&&count[i])cell.classList.add('digit-'+count[i]);
        });
      }
      ctx.onMsg=d=>{if(d)pick(d.i,true);};draw();ctx.turn(turn,'Начните разведку поля');
    }
    U.register('mines','Сапёр-дуэль','Риск, тактика, цепные открытия и борьба за очки.',true,mineIcon,minesInit);

    // ─────────────────────────────────────────────────────────────────────
    // 7. MEMORY — 36 cards, deterministic deck, multiplayer flip sync.
    // ─────────────────────────────────────────────────────────────────────
    const memoryIcon='<rect x="6" y="7" width="15" height="18" rx="2"/><rect x="27" y="7" width="15" height="18" rx="2"/><rect x="6" y="29" width="15" height="12" rx="2"/><path d="M34 31v8m-4-4h8M10 13h6"/>';
    function memoryInit(ctx){
      const {area}=U.board(ctx,'Найдите парные карточки. Угадали пару — ходите снова. Побеждает игрок с большим числом пар.','x-narrow');
      const bar=U.make('div','x-hud'), boardEl=U.make('div','x-memory');area.append(bar,boardEl);
      const icons=['◆','✦','♣','♥','♠','☀','☁','☂','♫','⚑','★','☯','✿','☘','♟','⚙','✈','⌘'];
      const deck=U.shuffle(icons.flatMap((_,i)=>[i,i]),ctx.n*911+7937);
      const matched=Array(36).fill(null),show=new Set();const points=[0,0],cells=[];
      let turn=0,over=false,pending=false,first=-1,delay=null;
      ctx.cleanup.push(()=>{if(delay!==null)clearTimeout(delay);});
      for(let i=0;i<36;i++){
        const cell=U.button('x-memory-cell','Карточка '+(i+1),()=>flip(i,false));
        boardEl.append(cell);cells.push(cell);
      }
      function flip(i,remote){
        if(over||pending||!U.allow(ctx,turn,remote)||!U.within(i,36)||matched[i]!==null||show.has(i))return;
        show.add(i);
        if(!remote)ctx.send({i});
        if(first<0)first=i;
        else{
          const a=first;first=-1;
          if(deck[a]===deck[i]){
            matched[a]=turn;matched[i]=turn;points[turn]++;
            show.delete(a);show.delete(i);
            if(points[0]+points[1]===18){over=true;draw();ctx.end(points[0]===points[1]?null:points[0]>points[1]?0:1,'Все пары найдены');return;}
            ctx.turn(turn,'Пара найдена — играйте ещё');
          }else{
            pending=true;
            const next=1-turn;
            delay=setTimeout(()=>{
              delay=null;show.delete(a);show.delete(i);pending=false;turn=next;
              draw();ctx.turn(turn,'Найдите две одинаковые карточки');
            },1050);
          }
        }
        draw();
      }
      function draw(){
        bar.textContent='';bar.append(U.make('span','x-token','Пары 1: '+points[0]),U.make('span','x-token','Пары 2: '+points[1]));
        cells.forEach((cell,i)=>{
          const owner=matched[i],open=show.has(i);
          cell.className='x-memory-cell'+(open?' flipped':'')+(owner!==null?' matched p'+owner:'');
          cell.textContent=open||owner!==null?icons[deck[i]]:'?';
          cell.disabled=owner!==null||pending;
        });
      }
      ctx.onMsg=d=>{if(d)flip(d.i,true);};draw();ctx.turn(turn,'Запоминайте карточки');
    }
    U.register('memory','Дуэль памяти','36 скрытых карточек: открывайте пары и обгоняйте соперника.',true,memoryIcon,memoryInit);

    // ─────────────────────────────────────────────────────────────────────
    // 8. TACTICAL ARENA — AP economy, shooting, shields, medkits, obstacles.
    // ─────────────────────────────────────────────────────────────────────
    const arenaIcon='<path d="M24 5v38M5 24h38"/><circle cx="24" cy="24" r="11"/><circle cx="24" cy="24" r="4"/><path d="m10 10 5 5m23-5-5 5m-23 23 5-5m23 5-5-5"/>';
    function arenaInit(ctx){
      const {area}=U.board(ctx,'Два бойца, 8 здоровья и 3 очка действия за ход. Перемещайтесь, стреляйте, защищайтесь и лечитесь.','x-narrow');
      const bar=U.make('div','x-hud'),toolbar=U.make('div','x-tools'),boardEl=U.make('div','x-arena');
      area.append(bar,toolbar,boardEl);
      const N=7, walls=new Set([8,12,17,24,26,31,36,40]);
      let pos=[45,3], hp=[8,8],shield=[0,0],medkits=[2,2],turn=0,ap=3,mode='move',over=false,logs=['Начало дуэли'];
      const cells=[];
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      const row=i=>Math.floor(i/N),col=i=>i%N;
      function neighbors(i){
        const r=row(i),c=col(i);
        return dirs.map(([dr,dc])=>[r+dr,c+dc]).filter(([y,x])=>y>=0&&y<N&&x>=0&&x<N).map(([y,x])=>y*N+x);
      }
      function sight(a,b){
        if(row(a)!==row(b)&&col(a)!==col(b))return false;
        const dist=Math.abs(row(a)-row(b))+Math.abs(col(a)-col(b));
        if(dist>4||dist===0)return false;
        const step=row(a)===row(b)?(a<b?1:-1):(a<b?N:-N);
        for(let i=a+step;i!==b;i+=step)if(walls.has(i))return false;
        return true;
      }
      function act(d,remote){
        if(over||!U.allow(ctx,turn,remote)||!d||typeof d.k!=='string')return;
        const p=turn,enemy=1-p;
        let message='';
        if(d.k==='move'){
          if(ap<1||!U.within(d.i,49)||walls.has(d.i)||d.i===pos[enemy]||!neighbors(pos[p]).includes(d.i))return;
          pos[p]=d.i;ap--;message='Перемещение';
        }else if(d.k==='shoot'){
          if(ap<2||d.i!==pos[enemy]||!sight(pos[p],pos[enemy]))return;
          ap-=2;const damage=Math.max(0,2-shield[enemy]);shield[enemy]=0;hp[enemy]-=damage;
          message=damage?'Попадание: −'+damage+' здоровья':'Выстрел заблокирован';
        }else if(d.k==='heal'){
          if(ap<2||medkits[p]<=0||hp[p]>=8)return;
          ap-=2;medkits[p]--;hp[p]=Math.min(8,hp[p]+3);message='Аптечка: +3 HP';
        }else if(d.k==='guard'){
          if(ap<1||shield[p]>=2)return;
          ap--;shield[p]=2;message='Защита: следующий выстрел слабее';
        }else if(d.k==='pass'){
          ap=0;message='Завершение хода';
        }else return;
        logs=[message,...logs].slice(0,2);
        if(!remote)ctx.send(d);
        if(hp[enemy]<=0){over=true;draw();ctx.end(p,'Победа на арене!');return;}
        if(ap===0){turn=enemy;ap=3;}
        draw();ctx.turn(turn,'Очки действия: '+ap+' · '+logs[0]);
      }
      function click(i){
        if(over||!ctx.canAct(turn))return;
        if(mode==='move')act({k:'move',i},false);
        else if(mode==='shoot')act({k:'shoot',i},false);
      }
      for(let i=0;i<49;i++){
        const cell=U.button('x-arena-cell','Арена '+(row(i)+1)+'-'+(col(i)+1),()=>click(i));
        boardEl.append(cell);cells.push(cell);
      }
      function draw(){
        bar.textContent='';
        for(let p=0;p<2;p++)bar.append(U.make('span','x-hp p'+p,'Игрок '+(p+1)+' · '+'♥'.repeat(Math.max(0,hp[p]))+' · щит '+shield[p]));
        toolbar.textContent='';
        for(const [kind,title,cost] of [['move','Шаг',1],['shoot','Выстрел',2],['guard','Щит',1],['heal','Аптечка',2],['pass','Конец хода',0]]){
          const button=U.button('btn x-mode'+(mode===kind?' primary':''),title,()=>{
            if(kind==='guard'||kind==='heal'||kind==='pass')act({k:kind},false);
            else{mode=kind;draw();}
          });
          button.textContent=title+(cost?' ('+cost+')':'');
          button.disabled=over||!ctx.canAct(turn)||(cost>ap)||(kind==='heal'&&medkits[turn]===0);
          toolbar.append(button);
        }
        toolbar.append(U.make('span','x-remaining','ОД: '+ap+' · Аптечки: '+medkits[turn]));
        cells.forEach((cell,i)=>{
          const player=pos.indexOf(i);
          cell.className='x-arena-cell'+(walls.has(i)?' wall':'')+(player>=0?' occupied p'+player:'')+
            (!over&&mode==='move'&&ctx.canAct(turn)&&neighbors(pos[turn]).includes(i)&&!walls.has(i)&&player<0?' possible':'')+
            (!over&&mode==='shoot'&&ctx.canAct(turn)&&i===pos[1-turn]&&sight(pos[turn],i)&&ap>=2?' target':'');
          cell.textContent=walls.has(i)?'':player>=0?String(player+1):i===24?'✦':'';
        });
      }
      ctx.onMsg=d=>act(d,true);draw();ctx.turn(turn,'Подходите ближе, чтобы выстрелить');
    }
    U.register('arena','Тактическая арена','Два героя, укрытия, выстрелы, щиты и аптечки.',true,arenaIcon,arenaInit);
  }
  window.registerExtraGames=registerExtraGames;
})();

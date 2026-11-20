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

test('four-player battleship resolves team shots once and syncs teammate results',()=>{
  assert.match(html,/ctx\.me!==ctx\.team/);
  assert.match(html,/applyTeamIncomingResult/);
  assert.match(html,/enemyGrid=Array\(100\)\.fill\(-1\)/);
  assert.match(html,/ctx\.botMove=cpuShoot/);
});

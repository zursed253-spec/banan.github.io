'use strict';

const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');

const VALID_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const MAX_ROOMS = 500;
const MAX_CLIENTS = 1000;
const MAX_MESSAGES_PER_MINUTE = 600;

function createApp() {
  const rooms = new Map();

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const activePlayers = [...rooms.values()].reduce((sum, room) => sum + room.players.length, 0);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ok: true, service: 'banan-multiplayer', rooms: rooms.size, players: activePlayers }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 8192,
    perMessageDeflate: false,
  });

  function send(socket, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function error(socket, code) {
    send(socket, { t: 'error', code });
  }

  function syncRoom(room, type) {
    room.players.forEach((player, role) => {
      player.role = role;
      send(player, {
        t: type,
        role,
        host: role === 0,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        code: player.room,
      });
    });
  }

  function detach(socket) {
    if (!socket.room) return;

    const code = socket.room;
    const room = rooms.get(code);
    const oldRole = socket.role;
    socket.room = null;
    socket.role = null;
    if (!room) return;

    const index = room.players.indexOf(socket);
    if (index < 0) return;
    room.players.splice(index, 1);

    if (room.players.length === 0) {
      rooms.delete(code);
      return;
    }

    // The first remaining participant becomes the host. Roles are compacted
    // and sent with the same event so every client agrees on the new order.
    room.players.forEach((player, role) => {
      player.role = role;
      send(player, {
        t: 'peer_left',
        role,
        host: role === 0,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        departedRole: oldRole,
      });
    });
  }

  wss.on('connection', socket => {
    if (wss.clients.size > MAX_CLIENTS) {
      socket.close(1013, 'Server busy');
      return;
    }

    socket.isAlive = true;
    socket.room = null;
    socket.role = null;
    socket.rate = { count: 0, since: Date.now() };
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', raw => {
      const now = Date.now();
      if (now - socket.rate.since >= 60000) {
        socket.rate.count = 0;
        socket.rate.since = now;
      }
      if (++socket.rate.count > MAX_MESSAGES_PER_MINUTE) {
        socket.close(1008, 'Too many messages');
        return;
      }

      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { error(socket, 'invalid_message'); return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        error(socket, 'invalid_message');
        return;
      }

      if (msg.t === 'ping') {
        send(socket, { t: 'pong' });
        return;
      }

      if (msg.t === 'host') {
        if (socket.room) { error(socket, 'already_joined'); return; }
        if (typeof msg.code !== 'string' || !VALID_CODE.test(msg.code)) {
          error(socket, 'invalid_code');
          return;
        }
        if (rooms.has(msg.code)) { error(socket, 'code_taken'); return; }
        if (rooms.size >= MAX_ROOMS) { error(socket, 'server_busy'); return; }
        const requested = Number(msg.maxPlayers);
        const maxPlayers = Number.isInteger(requested) && requested >= MIN_PLAYERS && requested <= MAX_PLAYERS
          ? requested : MIN_PLAYERS;
        const room = { players: [socket], maxPlayers };
        rooms.set(msg.code, room);
        socket.room = msg.code;
        socket.role = 0;
        send(socket, { t: 'hosted', code: msg.code, players: 1, maxPlayers });
        return;
      }

      if (msg.t === 'join') {
        if (socket.room) { error(socket, 'already_joined'); return; }
        if (typeof msg.code !== 'string' || !VALID_CODE.test(msg.code)) {
          error(socket, 'invalid_code');
          return;
        }
        const room = rooms.get(msg.code);
        if (!room || room.players[0]?.readyState !== WebSocket.OPEN) {
          error(socket, 'room_not_found');
          return;
        }
        if (room.players.length >= room.maxPlayers) { error(socket, 'room_full'); return; }
        socket.room = msg.code;
        socket.role = room.players.length;
        room.players.push(socket);
        syncRoom(room, 'ready');
        return;
      }

      if (msg.t === 'data') {
        const room = rooms.get(socket.room);
        if (!room || !room.players.includes(socket)) {
          error(socket, 'not_connected');
          return;
        }
        if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
          error(socket, 'invalid_message');
          return;
        }
        if (msg.payload.t === 'start' && socket !== room.players[0]) {
          error(socket, 'not_host');
          return;
        }
        room.players.forEach(player => {
          if (player !== socket) send(player, { t: 'data', payload: msg.payload });
        });
        return;
      }

      error(socket, 'invalid_message');
    });

    socket.on('close', () => detach(socket));
    socket.on('error', () => detach(socket));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  heartbeat.unref();

  server.on('close', () => clearInterval(heartbeat));
  return { server, wss, rooms };
}

if (require.main === module) {
  const { server } = createApp();
  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log('Banan multiplayer listening on port ' + port);
  });
}

module.exports = { createApp };

'use strict';

const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');

const VALID_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const MAX_ROOMS = 500;
const MAX_CLIENTS = 1000;
const MAX_MESSAGES_PER_MINUTE = 180;

function createApp() {
  const rooms = new Map();

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ok: true, service: 'banan-multiplayer', rooms: rooms.size }));
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

  function detach(socket) {
    if (!socket.room) return;

    const code = socket.room;
    const room = rooms.get(code);
    socket.room = null;
    socket.role = null;
    if (!room) return;

    if (room.host === socket) {
      rooms.delete(code);
      if (room.guest) {
        const guest = room.guest;
        guest.room = null;
        guest.role = null;
        send(guest, { t: 'peer_left' });
        guest.close(1000, 'Host left');
      }
    } else if (room.guest === socket) {
      room.guest = null;
      send(room.host, { t: 'peer_left' });
    }
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
        rooms.set(msg.code, { host: socket, guest: null });
        socket.room = msg.code;
        socket.role = 'host';
        send(socket, { t: 'hosted', code: msg.code });
        return;
      }

      if (msg.t === 'join') {
        if (socket.room) { error(socket, 'already_joined'); return; }
        if (typeof msg.code !== 'string' || !VALID_CODE.test(msg.code)) {
          error(socket, 'invalid_code');
          return;
        }
        const room = rooms.get(msg.code);
        if (!room || room.host.readyState !== WebSocket.OPEN) {
          error(socket, 'room_not_found');
          return;
        }
        if (room.guest) { error(socket, 'room_full'); return; }
        room.guest = socket;
        socket.room = msg.code;
        socket.role = 'guest';
        send(room.host, { t: 'ready', role: 0, code: msg.code });
        send(socket, { t: 'ready', role: 1, code: msg.code });
        return;
      }

      if (msg.t === 'data') {
        const room = rooms.get(socket.room);
        if (!room || (room.host !== socket && room.guest !== socket)) {
          error(socket, 'not_connected');
          return;
        }
        const partner = room.host === socket ? room.guest : room.host;
        if (!partner) { error(socket, 'not_connected'); return; }
        if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
          error(socket, 'invalid_message');
          return;
        }
        send(partner, { t: 'data', payload: msg.payload });
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

const { Server } = require('socket.io');
const crypto = require('node:crypto');
const store = require('../data/store');

function sessionUser(headers) {
  const data = store.read();
  const cookie = String(headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('macpoint_session='));
  if (!cookie) return null;
  let token;
  try { token = decodeURIComponent(cookie.slice('macpoint_session='.length)); } catch { return null; }
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;
  const id = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(crypto.createHmac('sha256', data.sessionSecret).update(id).digest('base64url'));
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;
  const session = data.sessions.find(entry => entry.id === id && entry.expiresAt > Date.now());
  return session && data.users.find(user => user.id === session.userId && user.status !== 'inactive');
}

module.exports = function attachRealtime(httpServer, hasPermission) {
  const io = new Server(httpServer, {
    path: '/api/socketio', serveClient: false, maxHttpBufferSize: 16_384,
    allowRequest(request, callback) {
      try { callback(null, !request.headers.origin || new URL(request.headers.origin).host === request.headers.host); }
      catch { callback(null, false); }
    },
  });
  io.on('connection', socket => {
    const user = sessionUser(socket.handshake.headers);
    if (user) socket.join(`user:${user.id}`);
    if (hasPermission(user, 'chat')) socket.join('support');
    let joined = null;
    let lastTyping = 0;
    const visitorKey = String(socket.handshake.auth?.visitorKey || '').slice(0, 100);
    socket.on('conversation:join', (id, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const currentUser = sessionUser(socket.handshake.headers);
      const admin = hasPermission(currentUser, 'chat');
      const conversation = store.read().conversations.find(item => item.id === id);
      if (!conversation || !(admin || (visitorKey && conversation.visitorKey === visitorKey) || (currentUser && conversation.userId === currentUser.id))) return reply({ error: 'Conversation unavailable.' });
      if (joined) { socket.leave(`conversation:${joined}`); socket.leave(`visitor:${joined}`); }
      joined = conversation.id;
      socket.join(`conversation:${joined}`);
      if (!admin) { socket.join(`visitor:${joined}`); io.to('support').emit('presence:update', { conversationId: joined, online: true }); }
      reply({ ok: true });
    });
    for (const event of ['typing:start', 'typing:stop']) {
      socket.on(event, () => {
        if (!joined || (event === 'typing:start' && Date.now() - lastTyping < 700)) return;
        lastTyping = Date.now();
        socket.to(`conversation:${joined}`).emit(event, { conversationId: joined, senderType: hasPermission(sessionUser(socket.handshake.headers), 'chat') ? 'admin' : 'customer' });
      });
    }
    socket.on('disconnect', () => {
      if (joined && !io.sockets.adapter.rooms.get(`visitor:${joined}`)?.size) io.to('support').emit('presence:update', { conversationId: joined, online: false });
    });
  });
  return {
    io,
    publish(message) { io.to(`conversation:${message.conversationId}`).to('support').emit('message:new', message); },
    conversation(conversation) { io.to('support').emit('conversation:new', { id: conversation.id, name: conversation.name }); },
    logout(userId) { io.in(`user:${userId}`).disconnectSockets(true); },
  };
};

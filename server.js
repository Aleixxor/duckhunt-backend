const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // ou especifique a URL do seu frontend
    methods: ["GET", "POST"]
  }
});

// Armazena os dados das salas
const rooms = {};

io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  socket.on('joinRoom', ({ roomId, isHost }) => {
    socket.join(roomId);
    console.log(`${socket.id} entrou na sala ${roomId} como ${isHost ? 'host' : 'player'}`);
    if (!rooms[roomId]) {
        rooms[roomId] = { hostId: null, players: {} };
      }
    if(isHost) {
      // Marca este socket como host da sala
      rooms[roomId].hostId = socket.id;
    } else {
      rooms[roomId].players[socket.id] = { score: 0, confirmed: false };
      // Se a sala já tiver um host, notifica o host que um player entrou
      const hostSocketId = rooms[roomId].hostId;
      if(hostSocketId) {
        io.to(hostSocketId).emit('playerJoined', { playerId: socket.id });
      }
    }
  });

  socket.on('shoot', (data) => {
    // data: { roomId, participantId, orientation }
    const room = rooms[data.roomId];
    if (room && room.hostId) {
      io.to(room.hostId).emit('shoot', { participantId: data.participantId, orientation: data.orientation });
    }
  });

  socket.on('startNextPhase', (data) => {
    // Host inicia a próxima fase e notifica todos
    io.in(data.roomId).emit('nextPhase');
  });

  socket.on('phaseConfirmed', (data) => {
    const room = rooms[data.roomId];
    if (room && room.hostId) {
      io.to(room.hostId).emit('phaseConfirmed', { participantId: data.participantId });
    }
  });

  socket.on('removePlayer', (data) => {
    const room = rooms[data.roomId];
    if (room && room.players[data.participantId]) {
      io.to(data.participantId).emit('removed');
      delete room.players[data.participantId];
      io.to(room.hostId).emit('playerRemoved', { participantId: data.participantId });
    }
  });

  socket.on('disconnecting', () => {
    // Verifica se este socket é host de alguma sala
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(roomId => {
      if(rooms[roomId]?.hostId === socket.id) {
        delete rooms[roomId];
        // Opcional: notifica os players que o host saiu
        io.to(roomId).emit('hostLeft');
      }
    });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].hostId === socket.id) {
        io.in(roomId).emit('hostLeft');
        delete rooms[roomId];
      } else if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        if (rooms[roomId].hostId) {
          io.to(rooms[roomId].hostId).emit('playerRemoved', { participantId: socket.id });
        }
      }
    }
    console.log('Usuário desconectado:', socket.id);
  });

  socket.on('sendMessage', ({ roomId, message, sender }) => {
    // Emite a mensagem para todos na sala
    io.to(roomId).emit('newMessage', { message, sender });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

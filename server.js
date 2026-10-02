/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-require-imports */
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
const io = new Server(PORT, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name || "Guest";
    socket.to(roomId).emit("user-joined", {
      id: socket.id,
      name: socket.data.name,
    });
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", {
      offer,
      from: socket.id,
      name: socket.data.name,
    });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", {
      answer,
      from: socket.id,
    });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", {
      candidate,
      from: socket.id,
    });
  });

  socket.on("chat-message", (message) => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit("chat-message", {
        ...message,
        mine: false,
      });
    }
  });

  socket.on("leave-room", ({ roomId }) => {
    socket.to(roomId).emit("user-left", socket.id);
    socket.leave(roomId);
  });

  socket.on("disconnect", () => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit("user-left", socket.id);
    }
  });
});

console.log(`Signaling server running on port ${PORT}`);
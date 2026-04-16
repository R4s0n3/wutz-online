import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createRoom,
  resolveAction,
  snapshotFor,
  startRound,
  type ServerPlayer,
  type ServerRoom
} from "../shared/game.js";
import type { ClientToServerEvents, PublicRoomInfo, RoomOptions, ServerToClientEvents } from "../shared/types.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*"
  }
});

type SocketPlayer = {
  id: string;
  name: string;
  roomId?: string;
};

const rooms = new Map<string, ServerRoom>();
const players = new Map<string, SocketPlayer>();

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

function randomCode(length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function randomRoomId(): string {
  return `room_${Math.random().toString(36).slice(2, 10)}`;
}

function listPublicRooms(): PublicRoomInfo[] {
  return [...rooms.values()]
    .filter((room) => !room.options.isPrivate)
    .map((room) => ({
      roomId: room.roomId,
      code: room.code,
      playerCount: room.players.filter((player) => !player.eliminated).length,
      maxPlayers: room.options.maxPlayers,
      phase: room.phase
    }));
}

function broadcastRoomList(): void {
  io.emit("room:list", listPublicRooms());
}

function broadcastSnapshot(room: ServerRoom): void {
  for (const player of room.players) {
    io.to(player.id).emit("room:snapshot", snapshotFor(room, player.id));
  }
}

function scheduleNextRound(room: ServerRoom): void {
  if (room.phase === "game-over") {
    broadcastSnapshot(room);
    broadcastRoomList();
    return;
  }

  broadcastSnapshot(room);
  setTimeout(() => {
    const freshRoom = rooms.get(room.roomId);
    if (!freshRoom || freshRoom.phase !== "round-over") {
      return;
    }
    startRound(freshRoom);
    broadcastSnapshot(freshRoom);
    broadcastRoomList();
  }, 4500);
}

function upsertServerPlayer(room: ServerRoom, socketId: string, name: string): ServerPlayer {
  const existing = room.players.find((player) => player.id === socketId);
  if (existing) {
    existing.name = name;
    existing.connected = true;
    return existing;
  }

  const player: ServerPlayer = {
    id: socketId,
    name,
    seat: room.players.length,
    lives: 3,
    swimming: false,
    eliminated: false,
    connected: true,
    hand: []
  };
  room.players.push(player);
  return player;
}

function findRoom(idOrCode: string): ServerRoom | undefined {
  return rooms.get(idOrCode) ?? [...rooms.values()].find((room) => room.code === idOrCode.toUpperCase());
}

function canJoin(room: ServerRoom): string | undefined {
  if (room.players.filter((player) => !player.eliminated).length >= room.options.maxPlayers) {
    return "This table is full.";
  }
  if (room.phase !== "lobby") {
    return "This room already started.";
  }
  return undefined;
}

function attachPlayerToRoom(socketId: string, room: ServerRoom, name: string): void {
  const playerRecord = players.get(socketId) ?? { id: socketId, name };
  playerRecord.name = name;
  playerRecord.roomId = room.roomId;
  players.set(socketId, playerRecord);
  upsertServerPlayer(room, socketId, name);
}

io.on("connection", (socket) => {
  socket.on("player:upsert", ({ name }, ack) => {
    players.set(socket.id, {
      id: socket.id,
      name
    });
    ack({ playerId: socket.id });
  });

  socket.on("room:list", (ack) => {
    const roomList = listPublicRooms();
    ack(roomList);
    socket.emit("room:list", roomList);
  });

  socket.on("room:create", ({ name, isPrivate, maxPlayers, allowPass }, ack) => {
    const code = randomCode();
    const room = createRoom(randomRoomId(), code, socket.id, {
      allowPass,
      isPrivate,
      maxPlayers
    } satisfies RoomOptions);
    rooms.set(room.roomId, room);
    attachPlayerToRoom(socket.id, room, name);
    socket.join(room.roomId);
    broadcastSnapshot(room);
    broadcastRoomList();
    ack({ roomId: room.roomId, code: room.code });
  });

  socket.on("room:join", ({ roomIdOrCode, name }, ack) => {
    const room = findRoom(roomIdOrCode);
    if (!room) {
      ack({ ok: false, error: "Room not found." });
      return;
    }
    const joinError = canJoin(room);
    if (joinError) {
      ack({ ok: false, error: joinError });
      return;
    }
    attachPlayerToRoom(socket.id, room, name);
    socket.join(room.roomId);
    broadcastSnapshot(room);
    broadcastRoomList();
    ack({ ok: true });
  });

  socket.on("room:quickplay", ({ name }, ack) => {
    const candidate = [...rooms.values()].find(
      (room) =>
        !room.options.isPrivate &&
        room.phase === "lobby" &&
        room.players.filter((player) => !player.eliminated).length < room.options.maxPlayers
    );

    if (candidate) {
      attachPlayerToRoom(socket.id, candidate, name);
      socket.join(candidate.roomId);
      broadcastSnapshot(candidate);
      broadcastRoomList();
      ack({ roomId: candidate.roomId, code: candidate.code });
      return;
    }

    const room = createRoom(randomRoomId(), randomCode(), socket.id, {
      allowPass: true,
      isPrivate: false,
      maxPlayers: 6
    });
    rooms.set(room.roomId, room);
    attachPlayerToRoom(socket.id, room, name);
    socket.join(room.roomId);
    broadcastSnapshot(room);
    broadcastRoomList();
    ack({ roomId: room.roomId, code: room.code });
  });

  socket.on("game:start", (ack) => {
    const roomId = players.get(socket.id)?.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) {
      ack({ ok: false, error: "You are not in a room." });
      return;
    }
    if (room.hostId !== socket.id) {
      ack({ ok: false, error: "Only the host can start the round." });
      return;
    }
    if (room.players.filter((player) => !player.eliminated).length < 2) {
      ack({ ok: false, error: "At least two players are required." });
      return;
    }

    startRound(room);
    broadcastSnapshot(room);
    broadcastRoomList();
    ack({ ok: true });
  });

  socket.on("game:action", (payload, ack) => {
    const roomId = players.get(socket.id)?.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) {
      ack({ ok: false, error: "You are not in a room." });
      return;
    }

    const result = resolveAction(room, socket.id, payload);
    ack(result);
    if (!result.ok) {
      return;
    }

    if (room.phase === "round-over" || room.phase === "game-over") {
      scheduleNextRound(room);
      return;
    }

    broadcastSnapshot(room);
    broadcastRoomList();
  });

  socket.on("disconnect", () => {
    const playerRecord = players.get(socket.id);
    if (!playerRecord?.roomId) {
      players.delete(socket.id);
      return;
    }

    const room = rooms.get(playerRecord.roomId);
    if (!room) {
      players.delete(socket.id);
      return;
    }

    const roomPlayer = room.players.find((player) => player.id === socket.id);
    if (roomPlayer) {
      roomPlayer.connected = false;
    }

    if (room.players.every((player) => !player.connected)) {
      rooms.delete(room.roomId);
      broadcastRoomList();
      players.delete(socket.id);
      return;
    }

    if (room.hostId === socket.id) {
      const nextHost = room.players.find((player) => player.connected && !player.eliminated);
      if (nextHost) {
        room.hostId = nextHost.id;
      }
    }

    broadcastSnapshot(room);
    broadcastRoomList();
    players.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Wutz server listening on http://localhost:${PORT}`);
});

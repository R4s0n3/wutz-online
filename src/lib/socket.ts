import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/types";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io("http://localhost:3001", {
  autoConnect: true
});

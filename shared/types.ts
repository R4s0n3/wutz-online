export type Suit = "clubs" | "spades" | "hearts" | "diamonds";
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
};

export type PlayerSummary = {
  id: string;
  name: string;
  seat: number;
  lives: number;
  swimming: boolean;
  eliminated: boolean;
  connected: boolean;
  handCount: number;
  revealedHand?: Card[];
  score?: number;
  isDealer: boolean;
  isCurrentTurn: boolean;
  isHost: boolean;
};

export type GamePhase = "lobby" | "playing" | "round-over" | "game-over";

export type RoomOptions = {
  allowPass: boolean;
  isPrivate: boolean;
  maxPlayers: number;
};

export type RoomSnapshot = {
  roomId: string;
  code: string;
  phase: GamePhase;
  options: RoomOptions;
  players: PlayerSummary[];
  selfId: string;
  hand: Card[];
  market: Card[];
  discardCount: number;
  drawCount: number;
  dealerIndex: number;
  turnIndex: number;
  lastAction?: string;
  winnerId?: string;
  knockingPlayerId?: string;
  finalTurnsRemaining: number;
  consecutivePasses: number;
  activePlayerCount: number;
  roundNumber: number;
};

export type PublicRoomInfo = {
  roomId: string;
  code: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
};

export type ClientToServerEvents = {
  "player:upsert": (payload: { name: string }, ack: (response: { playerId: string }) => void) => void;
  "room:create": (
    payload: { name: string; isPrivate: boolean; maxPlayers: number; allowPass: boolean },
    ack: (response: { roomId: string; code: string }) => void
  ) => void;
  "room:join": (
    payload: { roomIdOrCode: string; name: string },
    ack: (response: { ok: boolean; error?: string }) => void
  ) => void;
  "room:quickplay": (payload: { name: string }, ack: (response: { roomId: string; code: string }) => void) => void;
  "room:list": (ack: (rooms: PublicRoomInfo[]) => void) => void;
  "game:start": (ack: (response: { ok: boolean; error?: string }) => void) => void;
  "game:action": (
    payload:
      | { type: "swap-one"; handIndex: number; marketIndex: number }
      | { type: "swap-all" }
      | { type: "pass" }
      | { type: "knock" },
    ack: (response: { ok: boolean; error?: string }) => void
  ) => void;
};

export type ServerToClientEvents = {
  "room:list": (rooms: PublicRoomInfo[]) => void;
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:error": (payload: { error: string }) => void;
};

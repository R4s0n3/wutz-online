import type { Card, PlayerSummary, Rank, RoomOptions, RoomSnapshot, Suit } from "./types.js";

export const SUITS: Suit[] = ["clubs", "spades", "hearts", "diamonds"];
export const RANKS: Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

const VALUE_BY_RANK: Record<Rank, number> = {
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11
};

export type ServerPlayer = {
  id: string;
  name: string;
  seat: number;
  lives: number;
  swimming: boolean;
  eliminated: boolean;
  connected: boolean;
  hand: Card[];
  revealedHand?: Card[];
};

export type ServerRoom = {
  roomId: string;
  code: string;
  hostId: string;
  options: RoomOptions;
  phase: "lobby" | "playing" | "round-over" | "game-over";
  players: ServerPlayer[];
  dealerIndex: number;
  turnIndex: number;
  market: Card[];
  drawPile: Card[];
  discardPile: Card[];
  consecutivePasses: number;
  passChainStarterIndex: number | null;
  knockingPlayerId?: string;
  finalTurnsRemaining: number;
  lastAction?: string;
  winnerId?: string;
  roundNumber: number;
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 8)}`,
      suit,
      rank
    }))
  );
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function scoreHand(hand: Card[]): number {
  if (hand.length !== 3) {
    return 0;
  }

  const isThreeOfKind = hand.every((card) => card.rank === hand[0]?.rank);
  if (isThreeOfKind) {
    if (hand[0]?.rank === "A") {
      return 32;
    }
    return 30.5;
  }

  const suitTotals = new Map<Suit, number>();
  for (const card of hand) {
    const current = suitTotals.get(card.suit) ?? 0;
    suitTotals.set(card.suit, current + VALUE_BY_RANK[card.rank]);
  }

  return Math.max(...suitTotals.values());
}

export function scoreLabel(score: number): string {
  if (score === 32) {
    return "Fire";
  }
  if (score === 30.5) {
    return "30 1/2";
  }
  return `${score}`;
}

export function activePlayers(room: ServerRoom): ServerPlayer[] {
  return room.players.filter((player) => !player.eliminated);
}

export function createRoom(roomId: string, code: string, hostId: string, options: RoomOptions): ServerRoom {
  return {
    roomId,
    code,
    hostId,
    options,
    phase: "lobby",
    players: [],
    dealerIndex: 0,
    turnIndex: 0,
    market: [],
    drawPile: [],
    discardPile: [],
    consecutivePasses: 0,
    passChainStarterIndex: null,
    finalTurnsRemaining: 0,
    roundNumber: 0
  };
}

export function startRound(room: ServerRoom): void {
  const deck = shuffle(createDeck());
  const livingPlayers = activePlayers(room);

  room.phase = "playing";
  room.roundNumber += 1;
  room.knockingPlayerId = undefined;
  room.finalTurnsRemaining = 0;
  room.consecutivePasses = 0;
  room.passChainStarterIndex = null;
  room.lastAction = "A new round begins.";
  room.market = [];
  room.discardPile = [];

  for (const player of livingPlayers) {
    player.hand = [deck.pop(), deck.pop(), deck.pop()].filter(Boolean) as Card[];
    player.revealedHand = undefined;
  }

  const dealer = livingPlayers[room.dealerIndex % livingPlayers.length];
  const firstOffer = [deck.pop(), deck.pop(), deck.pop()].filter(Boolean) as Card[];
  const secondOffer = [deck.pop(), deck.pop(), deck.pop()].filter(Boolean) as Card[];
  const firstScore = scoreHand(firstOffer);
  const secondScore = scoreHand(secondOffer);

  if (dealer && firstScore >= secondScore) {
    dealer.hand = firstOffer;
    room.market = secondOffer;
  } else if (dealer) {
    dealer.hand = secondOffer;
    room.market = firstOffer;
  }

  room.drawPile = deck;
  room.turnIndex = livingPlayers.length > 1 ? (room.dealerIndex + 1) % livingPlayers.length : room.dealerIndex;

  const instantWinner = livingPlayers.find((player) => scoreHand(player.hand) >= 31);
  if (instantWinner) {
    room.lastAction = `${instantWinner.name} reveals ${scoreLabel(scoreHand(instantWinner.hand))}.`;
    endRound(room, instantWinner.id, scoreHand(instantWinner.hand) === 32);
  }
}

export function ensureDraw(room: ServerRoom): void {
  if (room.drawPile.length >= 3) {
    return;
  }

  if (room.discardPile.length > 0) {
    room.drawPile = shuffle(room.discardPile);
    room.discardPile = [];
  }
}

export function nextTurn(room: ServerRoom): void {
  const livingPlayers = activePlayers(room);
  if (livingPlayers.length <= 1) {
    return;
  }

  room.turnIndex = (room.turnIndex + 1) % livingPlayers.length;
}

function loseLife(player: ServerPlayer): void {
  if (player.eliminated) {
    return;
  }

  if (player.lives > 0) {
    player.lives -= 1;
    player.swimming = player.lives === 0;
    return;
  }

  player.eliminated = true;
  player.swimming = false;
}

export function endRound(room: ServerRoom, triggerPlayerId?: string, isFire = false): void {
  const livingPlayers = activePlayers(room);
  const scoredPlayers = livingPlayers.map((player) => ({
    player,
    score: scoreHand(player.hand)
  }));

  for (const entry of scoredPlayers) {
    entry.player.revealedHand = [...entry.player.hand];
  }

  if (isFire) {
    for (const { player } of scoredPlayers) {
      if (player.id !== triggerPlayerId) {
        loseLife(player);
      }
    }
  } else {
    const lowestScore = Math.min(...scoredPlayers.map((entry) => entry.score));
    for (const { player, score } of scoredPlayers) {
      if (score === lowestScore) {
        loseLife(player);
      }
    }
  }

  room.phase = "round-over";
  room.knockingPlayerId = undefined;
  room.finalTurnsRemaining = 0;
  room.consecutivePasses = 0;
  room.passChainStarterIndex = null;

  const survivors = activePlayers(room);
  if (survivors.length <= 1) {
    room.phase = "game-over";
    room.winnerId = survivors[0]?.id;
    room.lastAction = survivors[0] ? `${survivors[0].name} wins the table.` : "Game over.";
    return;
  }

  room.dealerIndex = (room.dealerIndex + 1) % survivors.length;
  room.lastAction = isFire ? "Fire. Everyone else burns a life." : "Round resolved. Lowest hand loses a life.";
}

export function resolveAction(
  room: ServerRoom,
  playerId: string,
  action:
    | { type: "swap-one"; handIndex: number; marketIndex: number }
    | { type: "swap-all" }
    | { type: "pass" }
    | { type: "knock" }
): { ok: boolean; error?: string } {
  if (room.phase !== "playing") {
    return { ok: false, error: "The round is not active." };
  }

  const livingPlayers = activePlayers(room);
  const currentPlayer = livingPlayers[room.turnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { ok: false, error: "It is not your turn." };
  }

  switch (action.type) {
    case "swap-one": {
      const handCard = currentPlayer.hand[action.handIndex];
      const marketCard = room.market[action.marketIndex];
      if (!handCard || !marketCard) {
        return { ok: false, error: "That swap is invalid." };
      }
      currentPlayer.hand[action.handIndex] = marketCard;
      room.market[action.marketIndex] = handCard;
      room.consecutivePasses = 0;
      room.passChainStarterIndex = null;
      room.lastAction = `${currentPlayer.name} traded a single card.`;
      break;
    }
    case "swap-all": {
      if (currentPlayer.hand.length !== 3 || room.market.length !== 3) {
        return { ok: false, error: "A full swap is not available." };
      }
      [currentPlayer.hand, room.market] = [room.market, currentPlayer.hand];
      room.consecutivePasses = 0;
      room.passChainStarterIndex = null;
      room.lastAction = `${currentPlayer.name} swept the market.`;
      break;
    }
    case "pass": {
      if (!room.options.allowPass) {
        return { ok: false, error: "Passing is disabled in this room." };
      }
      room.consecutivePasses += 1;
      if (room.passChainStarterIndex === null) {
        room.passChainStarterIndex = room.turnIndex;
      }
      room.lastAction = `${currentPlayer.name} passed.`;
      if (room.consecutivePasses >= livingPlayers.length) {
        room.discardPile.push(...room.market);
        ensureDraw(room);
        room.market = [room.drawPile.pop(), room.drawPile.pop(), room.drawPile.pop()].filter(Boolean) as Card[];
        room.consecutivePasses = 0;
        room.lastAction = "The market was refreshed after a full pass cycle.";
        room.turnIndex = room.passChainStarterIndex ?? room.turnIndex;
        room.passChainStarterIndex = null;
        return { ok: true };
      }
      break;
    }
    case "knock": {
      if (room.knockingPlayerId) {
        return { ok: false, error: "The round is already closing." };
      }
      room.knockingPlayerId = currentPlayer.id;
      room.finalTurnsRemaining = livingPlayers.length - 1;
      room.consecutivePasses = 0;
      room.passChainStarterIndex = null;
      room.lastAction = `${currentPlayer.name} knocked. One turn remains for everyone else.`;
      break;
    }
  }

  const score = scoreHand(currentPlayer.hand);
  if (score >= 31) {
    room.lastAction = `${currentPlayer.name} reveals ${scoreLabel(score)}.`;
    endRound(room, currentPlayer.id, score === 32);
    return { ok: true };
  }

  if (action.type === "knock") {
    nextTurn(room);
    return { ok: true };
  }

  if (room.knockingPlayerId) {
    room.finalTurnsRemaining -= 1;
    if (room.finalTurnsRemaining <= 0) {
      endRound(room, room.knockingPlayerId, false);
      return { ok: true };
    }
  }

  nextTurn(room);
  return { ok: true };
}

export function snapshotFor(room: ServerRoom, selfId: string): RoomSnapshot {
  const livingPlayers = activePlayers(room);
  const currentTurnPlayerId = livingPlayers[room.turnIndex]?.id;

  const players: PlayerSummary[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    lives: player.lives,
    swimming: player.swimming,
    eliminated: player.eliminated,
    connected: player.connected,
    handCount: player.hand.length,
    revealedHand: room.phase === "round-over" || room.phase === "game-over" ? player.revealedHand : undefined,
    score:
      room.phase === "round-over" || room.phase === "game-over"
        ? scoreHand(player.revealedHand ?? player.hand)
        : undefined,
    isDealer: livingPlayers[room.dealerIndex]?.id === player.id,
    isCurrentTurn: currentTurnPlayerId === player.id,
    isHost: room.hostId === player.id
  }));

  return {
    roomId: room.roomId,
    code: room.code,
    phase: room.phase,
    options: room.options,
    players,
    selfId,
    hand: room.players.find((player) => player.id === selfId)?.hand ?? [],
    market: room.market,
    discardCount: room.discardPile.length,
    drawCount: room.drawPile.length,
    dealerIndex: room.dealerIndex,
    turnIndex: room.turnIndex,
    lastAction: room.lastAction,
    winnerId: room.winnerId,
    knockingPlayerId: room.knockingPlayerId,
    finalTurnsRemaining: room.finalTurnsRemaining,
    consecutivePasses: room.consecutivePasses,
    activePlayerCount: livingPlayers.length,
    roundNumber: room.roundNumber
  };
}

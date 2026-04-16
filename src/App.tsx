import { useEffect, useRef, useState } from "react";
import { socket } from "./lib/socket";
import { scoreHand, scoreLabel } from "@shared/game";
import type { Card, GamePhase, PublicRoomInfo, RoomSnapshot } from "@shared/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function TableBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(87,255,247,0.16),transparent_28%),linear-gradient(180deg,#0a1228_0%,#060a16_100%)]" />
      <div className="absolute left-1/2 top-1/2 h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/20 bg-[radial-gradient(circle_at_center,rgba(15,66,89,0.82)_0%,rgba(9,31,56,0.92)_68%,rgba(6,15,33,1)_100%)] shadow-[0_0_0_18px_rgba(8,24,44,0.72),0_40px_120px_rgba(0,0,0,0.62)]" />
      <div className="absolute left-1/2 top-1/2 h-[66vmin] w-[66vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/10" />
      <div className="absolute left-[16%] top-[14%] h-40 w-28 rotate-[-18deg] rounded-[22px] border border-cyan-100/55 bg-[linear-gradient(180deg,#f8fcff_0%,#daecff_100%)] opacity-65 shadow-ember" />
      <div className="absolute right-[19%] top-[20%] h-40 w-28 rotate-[14deg] rounded-[22px] border border-cyan-100/55 bg-[linear-gradient(180deg,#f8fcff_0%,#daecff_100%)] opacity-45 shadow-ember" />
      <div className="absolute bottom-[21%] left-[24%] h-40 w-28 rotate-[10deg] rounded-[22px] border border-cyan-100/55 bg-[linear-gradient(180deg,#f8fcff_0%,#daecff_100%)] opacity-35 shadow-ember" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(173,228,255,0.08)_1px,transparent_1px)] bg-[length:22px_22px] opacity-[0.07]" />
    </div>
  );
}

type ActionState = {
  handIndex: number | null;
  marketIndex: number | null;
};

type NoticeTone = "neutral" | "action" | "warning";

type Notice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  clubs: "♣",
  spades: "♠",
  hearts: "♥",
  diamonds: "♦"
};

function cardTone(suit: Card["suit"]) {
  return suit === "hearts" || suit === "diamonds" ? "text-rose-700" : "text-slate-900";
}

function pipRows(rank: Card["rank"]): number[] {
  switch (rank) {
    case "7":
      return [2, 2, 1, 2];
    case "8":
      return [2, 2, 2, 2];
    case "9":
      return [2, 2, 1, 2, 2];
    case "10":
      return [2, 2, 2, 2, 2];
    default:
      return [];
  }
}

function FaceCardCenter({ card }: { card: Card }) {
  return (
    <div className="relative z-10 flex flex-1 items-center justify-center py-2">
      <div className={cn("face-crest flex h-[4.15rem] w-[2.95rem] flex-col items-center justify-between rounded-[8px] py-1.5", cardTone(card.suit))}>
        <div className="flex flex-col items-center leading-none">
          <span className="font-display text-[1.4rem]">{card.rank}</span>
          <span className="-mt-0.5 text-[0.72rem]">{SUIT_SYMBOL[card.suit]}</span>
        </div>
        <div className="h-px w-5 bg-current/20" />
        <div className="flex rotate-180 flex-col items-center leading-none">
          <span className="font-display text-[1.4rem]">{card.rank}</span>
          <span className="-mt-0.5 text-[0.72rem]">{SUIT_SYMBOL[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

function CardCenter({ card }: { card: Card }) {
  if (card.rank === "A") {
    return <div className={cn("relative z-10 flex flex-1 items-center justify-center text-center text-[3.2rem] leading-none", cardTone(card.suit))}>{SUIT_SYMBOL[card.suit]}</div>;
  }

  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
    return <FaceCardCenter card={card} />;
  }

  const rows = pipRows(card.rank);
  return (
    <div className={cn("relative z-10 flex flex-1 flex-col justify-center gap-[0.12rem] py-1 text-[0.82rem] leading-none", cardTone(card.suit))}>
      {rows.map((count, index) => (
        <div key={`${card.id}-${index}`} className="flex items-center justify-center gap-4">
          {count === 2 ? (
            <>
              <span>{SUIT_SYMBOL[card.suit]}</span>
              <span>{SUIT_SYMBOL[card.suit]}</span>
            </>
          ) : (
            <span>{SUIT_SYMBOL[card.suit]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function CardFace({
  card,
  selected,
  onClick,
  dimmed
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-face relative flex h-40 w-28 flex-col justify-between overflow-hidden rounded-[12px] border px-2.5 py-2.5 text-left transition duration-300",
        selected ? "border-cyan-400 -translate-y-3 rotate-[-2deg]" : "border-stone-200/80 hover:-translate-y-2",
        dimmed && "opacity-55 grayscale"
      )}
    >
      <div className="relative z-10 flex items-start justify-start pl-0.5 pt-0.5">
        <div className={cn("text-[0.92rem] font-semibold leading-none", cardTone(card.suit))}>
          <div>{card.rank}</div>
          <div className="mt-[1px] text-[0.82rem]">{SUIT_SYMBOL[card.suit]}</div>
        </div>
      </div>
      <CardCenter card={card} />
      <div className="relative z-10 flex items-end justify-end pr-0.5 pb-0.5">
        <div className={cn("rotate-180 text-[0.92rem] font-semibold leading-none", cardTone(card.suit))}>
          <div>{card.rank}</div>
          <div className="mt-[1px] text-[0.82rem]">{SUIT_SYMBOL[card.suit]}</div>
        </div>
      </div>
    </button>
  );
}

function Seat({ snapshot, playerId }: { snapshot: RoomSnapshot; playerId: string }) {
  const player = snapshot.players.find((entry) => entry.id === playerId);
  if (!player) {
    return null;
  }

  return (
    <div
      className={cn(
        "panel min-w-[150px] px-4 py-3",
        player.isCurrentTurn && "border-cyan-200/55 shadow-ember",
        player.eliminated && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-lg text-cyan-50">{player.name}</div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/45">
            {player.isDealer ? "Dealer" : player.isHost ? "Host" : "Seat"}
          </div>
        </div>
        <div className="text-right text-xs uppercase tracking-[0.18em] text-white/60">
          <div>{player.connected ? "Online" : "Away"}</div>
          <div>{player.swimming ? "Swimming" : `${player.lives} lives`}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-2 flex-1 rounded-full",
              index < player.lives ? "bg-cyan-300" : player.swimming && index === 0 ? "bg-sky-300" : "bg-white/10"
            )}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {player.revealedHand ? (
          player.revealedHand.map((card) => (
            <div
              key={card.id}
              className={cn(
                "card-mini rounded-md border border-white/10 px-2.5 py-1.5 text-sm shadow-lg",
                cardTone(card.suit)
              )}
            >
              <span className="font-semibold">{card.rank}</span>
              <span className="ml-1">{SUIT_SYMBOL[card.suit]}</span>
            </div>
          ))
        ) : (
          Array.from({ length: player.handCount }).map((_, index) => (
            <div key={index} className="card-back h-12 w-8 rounded-md border border-white/10" />
          ))
        )}
      </div>
      {typeof player.score === "number" ? (
        <div className="mt-3 text-sm uppercase tracking-[0.2em] text-cyan-100/90">{scoreLabel(player.score)}</div>
      ) : null}
    </div>
  );
}

function App() {
  const [name, setName] = useState("Heroine");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [selected, setSelected] = useState<ActionState>({ handIndex: null, marketIndex: null });
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeIdRef = useRef(0);
  const lastActionRef = useRef<string | undefined>(undefined);
  const lastPhaseRef = useRef<GamePhase | undefined>(undefined);
  const lastTurnRef = useRef(false);

  useEffect(() => {
    socket.emit("player:upsert", { name }, () => undefined);
    socket.emit("room:list", (roomList) => setRooms(roomList));

    const handleSnapshot = (nextSnapshot: RoomSnapshot) => {
      setSnapshot(nextSnapshot);
      setSelected({ handIndex: null, marketIndex: null });
    };

    const handleRoomList = (roomList: PublicRoomInfo[]) => setRooms(roomList);
    const handleError = (payload: { error: string }) => setError(payload.error);

    socket.on("room:snapshot", handleSnapshot);
    socket.on("room:list", handleRoomList);
    socket.on("room:error", handleError);

    return () => {
      socket.off("room:snapshot", handleSnapshot);
      socket.off("room:list", handleRoomList);
      socket.off("room:error", handleError);
    };
  }, [name]);

  const self = snapshot?.players.find((player) => player.id === snapshot.selfId);
  const isMyTurn = Boolean(self?.isCurrentTurn && snapshot?.phase === "playing");
  const myScore = scoreHand(snapshot?.hand ?? []);

  const pushNotice = (message: string, tone: NoticeTone = "neutral") => {
    const id = noticeIdRef.current + 1;
    noticeIdRef.current = id;
    setNotices((current) => [{ id, message, tone }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    }, tone === "action" ? 3600 : 4800);
  };

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (snapshot.lastAction && snapshot.lastAction !== lastActionRef.current) {
      pushNotice(snapshot.lastAction, snapshot.knockingPlayerId ? "warning" : "neutral");
      lastActionRef.current = snapshot.lastAction;
    }

    if (snapshot.phase !== lastPhaseRef.current) {
      if (snapshot.phase === "round-over") {
        pushNotice("Round over. Cards are revealed.", "warning");
      }
      if (snapshot.phase === "game-over") {
        pushNotice(
          `${snapshot.players.find((player) => player.id === snapshot.winnerId)?.name ?? "A player"} takes the table.`,
          "warning"
        );
      }
      lastPhaseRef.current = snapshot.phase;
    }

    if (isMyTurn && !lastTurnRef.current) {
      pushNotice("Your turn. Make your move.", "action");
    }

    lastTurnRef.current = isMyTurn;
  }, [isMyTurn, snapshot]);

  const createRoom = (isPrivate: boolean) => {
    socket.emit(
      "room:create",
      { name, isPrivate, maxPlayers: 6, allowPass: true },
      () => setError(null)
    );
  };

  const quickplay = () => {
    socket.emit("room:quickplay", { name }, () => setError(null));
  };

  const joinRoom = (roomIdOrCode: string) => {
    socket.emit("room:join", { roomIdOrCode, name }, (response) => {
      if (!response.ok) {
        setError(response.error ?? "Unable to join room.");
        return;
      }
      setError(null);
    });
  };

  const startGame = () => {
    socket.emit("game:start", (response) => {
      if (!response.ok) {
        setError(response.error ?? "Unable to start game.");
      }
    });
  };

  const submitAction = (
    action:
      | { type: "swap-one"; handIndex: number; marketIndex: number }
      | { type: "swap-all" }
      | { type: "pass" }
      | { type: "knock" }
  ) => {
    socket.emit("game:action", action, (response) => {
      if (!response.ok) {
        setError(response.error ?? "Action failed.");
        return;
      }
      setError(null);
    });
  };

  const tableSeats = snapshot ? snapshot.players.filter((player) => player.id !== snapshot.selfId).slice(0, 5) : [];

  if (!snapshot) {
    return (
      <main className="relative min-h-screen overflow-hidden px-6 py-8 text-white">
        <TableBackdrop />
        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <section className="soft-panel grid w-full gap-8 overflow-hidden p-8 lg:grid-cols-[1.2fr_0.98fr] lg:p-12">
            <div>
              <div className="pill">Online Table For Wutz</div>
              <h1 className="mt-5 max-w-xl font-display text-5xl leading-[0.95] text-cyan-50 md:text-7xl">
                Competitive card-room energy, built for instant online rounds.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/72">
                Jump into private lobbies or public queues with live updates, turn prompts, and a game table designed
                like a modern multiplayer card platform.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="text-xs uppercase tracking-[0.25em] text-white/50">Live Match Flow</div>
                  <div className="mt-2 text-white/85">Fast room join, quickplay seat-matching, and real-time table state across all players.</div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="text-xs uppercase tracking-[0.25em] text-white/50">Ranked-Style Controls</div>
                  <div className="mt-2 text-white/85">Clear action hierarchy, turn awareness, and readable card states tuned for online play.</div>
                </div>
              </div>
            </div>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-6 backdrop-blur-xl">
              <div className="panel-title">Take A Seat</div>
              <label className="mt-6 block text-sm uppercase tracking-[0.2em] text-white/60">Name At The Table</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field-input mt-2"
              />
              <div className="mt-6 grid gap-3">
                <button onClick={() => createRoom(true)} className="action-btn action-primary">
                  Open A Private Table
                </button>
                <button onClick={() => createRoom(false)} className="action-btn action-secondary">
                  Open A Public Table
                </button>
                <button onClick={quickplay} className="action-btn action-secondary">
                  Join The Next Open Seat
                </button>
              </div>
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="text-sm uppercase tracking-[0.2em] text-white/60">Join A Friend</div>
                <div className="mt-3 flex gap-3">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    className="field-input min-w-0 flex-1 uppercase"
                  />
                  <button
                    onClick={() => joinRoom(roomCodeInput)}
                    className="action-btn action-secondary whitespace-nowrap"
                  >
                    Join
                  </button>
                </div>
              </div>
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="text-sm uppercase tracking-[0.2em] text-white/60">Public Tables</div>
                <div className="mt-3 space-y-3">
                  {rooms.length === 0 ? <div className="text-white/55">No open tables right now.</div> : null}
                  {rooms.slice(0, 4).map((room) => (
                    <button
                      key={room.roomId}
                      onClick={() => joinRoom(room.code)}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left"
                    >
                      <span>
                        <span className="block font-display text-xl text-cyan-50">{room.code}</span>
                        <span className="block text-sm text-white/55">{room.playerCount}/{room.maxPlayers} seated</span>
                      </span>
                      <span className="pill">{room.phase}</span>
                    </button>
                  ))}
                </div>
              </div>
              {error ? <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-rose-100">{error}</div> : null}
            </section>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-white md:px-6 md:py-6">
      <TableBackdrop />
      <div className="relative mx-auto flex max-w-7xl">
        <section className="soft-panel table-ring relative min-h-[760px] w-full overflow-hidden p-4 md:p-6">
          <div className="absolute left-3 top-3 z-20 w-[min(320px,calc(100%-1.5rem))] md:left-6 md:top-6">
            <div className="hud-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill">Room {snapshot.code}</span>
                <span className="pill">Round {snapshot.roundNumber || 0}</span>
                <span className="pill">{snapshot.phase}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-display text-2xl text-cyan-50">Wutz Table</div>
                  <div className="mt-1 text-sm text-white/65">
                    {isMyTurn ? "Your turn at the table." : snapshot.lastAction ?? "Waiting for the next move."}
                  </div>
                </div>
                {snapshot.phase === "lobby" ? (
                  <button
                    onClick={startGame}
                    disabled={!self?.isHost}
                    className="action-btn action-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {self?.isHost ? "Start" : "Host Starts"}
                  </button>
                ) : null}
              </div>
              {error ? <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
            </div>
          </div>

          <div className="absolute right-3 top-3 z-20 flex w-[min(340px,calc(100%-1.5rem))] flex-col gap-3 md:right-6 md:top-6">
            {notices.map((notice) => (
              <div
                key={notice.id}
                className={cn(
                  "hud-panel px-4 py-3 text-sm leading-6",
                  notice.tone === "action" && "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
                  notice.tone === "warning" && "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-50"
                )}
              >
                {notice.message}
              </div>
            ))}
          </div>

          <div className="absolute bottom-3 left-3 z-20 w-[min(320px,calc(100%-1.5rem))] md:bottom-6 md:left-6">
            <div className="hud-panel p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">At A Glance</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/78">
                <div>Hand: {snapshot.hand.length === 3 ? scoreLabel(myScore) : "..."}</div>
                <div>Deck: {snapshot.drawCount}</div>
                <div>Discard: {snapshot.discardCount}</div>
                <div>Passes: {snapshot.consecutivePasses}</div>
                <div>Players in: {snapshot.activePlayerCount}</div>
                <div>{snapshot.options.allowPass ? "Passing allowed" : "No passing"}</div>
              </div>
              {snapshot.knockingPlayerId ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                  {snapshot.players.find((player) => player.id === snapshot.knockingPlayerId)?.name} knocked. One last turn
                  goes around the table.
                </div>
              ) : null}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-20 w-[min(320px,calc(100%-1.5rem))] md:bottom-6 md:right-6">
            <div className="hud-panel p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Your Move</div>
              <div className="mt-3 grid gap-3">
                <button
                  disabled={!isMyTurn || selected.handIndex === null || selected.marketIndex === null}
                  onClick={() =>
                    submitAction({
                      type: "swap-one",
                      handIndex: selected.handIndex!,
                      marketIndex: selected.marketIndex!
                    })
                  }
                  className="action-btn action-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Trade Selected
                </button>
                <button
                  disabled={!isMyTurn}
                  onClick={() => submitAction({ type: "swap-all" })}
                  className="action-btn action-secondary w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Take All Three
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={!isMyTurn || !snapshot.options.allowPass}
                    onClick={() => submitAction({ type: "pass" })}
                    className="action-btn action-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pass
                  </button>
                  <button
                    disabled={!isMyTurn}
                    onClick={() => submitAction({ type: "knock" })}
                    className="action-btn action-warning disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Knock
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[720px] flex-col justify-between pb-40 pt-32 md:pb-44 md:pt-32">
            <div className="grid gap-4 md:grid-cols-3">
              {tableSeats.map((player) => (
                <Seat key={player.id} snapshot={snapshot} playerId={player.id} />
              ))}
            </div>

            <div className="my-8 flex flex-col items-center justify-center">
              <div className="text-xs uppercase tracking-[0.3em] text-white/55">Center Cards</div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                {snapshot.market.map((card, index) => (
                  <CardFace
                    key={card.id}
                    card={card}
                    selected={selected.marketIndex === index}
                    onClick={() => setSelected((current) => ({ ...current, marketIndex: index }))}
                    dimmed={!isMyTurn}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/55">Your Cards</div>
                  <div className="mt-1 font-display text-2xl text-cyan-50">{self?.name}</div>
                </div>
                <div className="pill">{isMyTurn ? "Your turn" : "Waiting"}</div>
              </div>
              <div className="flex flex-wrap items-end justify-center gap-3">
                {snapshot.hand.map((card, index) => (
                  <div
                    key={card.id}
                    className={cn(
                      index === 0 && "-rotate-6",
                      index === 1 && "translate-y-1",
                      index === 2 && "rotate-6"
                    )}
                  >
                    <CardFace
                      card={card}
                      selected={selected.handIndex === index}
                      onClick={() => setSelected((current) => ({ ...current, handIndex: index }))}
                      dimmed={!isMyTurn}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;

import { useCallback, useEffect, useRef, useState } from "react";
import { createCustomId } from "mnemonic-id";
import { socket } from "./lib/socket";
import { scoreHand, scoreLabel } from "@shared/game";
import type { Card, GamePhase, PlayerSummary, PublicRoomInfo, RoomSnapshot } from "@shared/types";

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

type NoticeTone = "neutral" | "action" | "success" | "warning" | "danger";

type SoundCue = "select" | "join" | "turn" | "success" | "warning" | "error" | "round" | "game";

type Notice = {
  id: number;
  title: string;
  detail?: string;
  tone: NoticeTone;
};

type PendingRequest = "create-private" | "create-public" | "quickplay" | "join-room" | "start-game" | "game-action";

type ConnectionStatus = "connecting" | "online" | "offline";

type SoundNote = {
  frequency: number;
  offset: number;
  duration: number;
  gain?: number;
  type?: OscillatorType;
};

const NOTICE_STYLE: Record<NoticeTone, string> = {
  neutral: "border-cyan-200/15 bg-slate-950/70 text-cyan-50",
  action: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
  success: "border-teal-300/25 bg-teal-300/10 text-teal-50",
  warning: "border-amber-300/30 bg-amber-300/10 text-amber-50",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-50"
};

const SOUND_PATTERNS: Record<SoundCue, SoundNote[]> = {
  select: [{ frequency: 520, offset: 0, duration: 0.045, gain: 0.025, type: "triangle" }],
  join: [
    { frequency: 392, offset: 0, duration: 0.07, gain: 0.035, type: "sine" },
    { frequency: 587, offset: 0.08, duration: 0.09, gain: 0.04, type: "sine" }
  ],
  turn: [
    { frequency: 660, offset: 0, duration: 0.08, gain: 0.04, type: "triangle" },
    { frequency: 880, offset: 0.09, duration: 0.1, gain: 0.045, type: "triangle" },
    { frequency: 1175, offset: 0.19, duration: 0.13, gain: 0.035, type: "sine" }
  ],
  success: [
    { frequency: 523, offset: 0, duration: 0.08, gain: 0.035, type: "sine" },
    { frequency: 659, offset: 0.08, duration: 0.08, gain: 0.04, type: "sine" },
    { frequency: 784, offset: 0.16, duration: 0.11, gain: 0.035, type: "sine" }
  ],
  warning: [
    { frequency: 294, offset: 0, duration: 0.13, gain: 0.04, type: "square" },
    { frequency: 247, offset: 0.15, duration: 0.16, gain: 0.035, type: "triangle" }
  ],
  error: [
    { frequency: 185, offset: 0, duration: 0.13, gain: 0.045, type: "sawtooth" },
    { frequency: 147, offset: 0.14, duration: 0.18, gain: 0.035, type: "triangle" }
  ],
  round: [
    { frequency: 330, offset: 0, duration: 0.11, gain: 0.035, type: "sine" },
    { frequency: 494, offset: 0.12, duration: 0.12, gain: 0.04, type: "sine" },
    { frequency: 392, offset: 0.26, duration: 0.16, gain: 0.035, type: "triangle" }
  ],
  game: [
    { frequency: 392, offset: 0, duration: 0.12, gain: 0.04, type: "sine" },
    { frequency: 523, offset: 0.12, duration: 0.12, gain: 0.045, type: "sine" },
    { frequency: 659, offset: 0.24, duration: 0.12, gain: 0.04, type: "sine" },
    { frequency: 1047, offset: 0.38, duration: 0.22, gain: 0.035, type: "triangle" }
  ]
};

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  clubs: "♣",
  spades: "♠",
  hearts: "♥",
  diamonds: "♦"
};

function cardName(card: Card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function phaseLabel(phase: GamePhase) {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "playing":
      return "Playing";
    case "round-over":
      return "Round Over";
    case "game-over":
      return "Game Over";
  }
}

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function playerLifeLabel(player?: Pick<PlayerSummary, "lives" | "swimming" | "eliminated">) {
  if (!player) {
    return "...";
  }
  if (player.eliminated) {
    return "Out";
  }
  if (player.swimming) {
    return "Swimming";
  }
  return plural(player.lives, "life", "lives");
}

function playerRoleLabel(player?: Pick<PlayerSummary, "isDealer" | "isHost" | "seat">, capacity?: number) {
  if (!player) {
    return "Seat";
  }

  const seatLabel = `Seat ${player.seat + 1}${capacity ? `/${capacity}` : ""}`;
  if (player.isDealer) {
    return `Dealer / ${seatLabel}`;
  }
  if (player.isHost) {
    return `Host / ${seatLabel}`;
  }
  return seatLabel;
}

function LifePips({
  lives,
  swimming,
  eliminated,
  className,
  pipClassName = "h-2 flex-1"
}: {
  lives: number;
  swimming: boolean;
  eliminated?: boolean;
  className?: string;
  pipClassName?: string;
}) {
  return (
    <div
      className={cn("flex gap-1", className)}
      aria-label={eliminated ? "No lives remaining" : playerLifeLabel({ lives, swimming, eliminated: Boolean(eliminated) })}
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "rounded-full",
            pipClassName,
            eliminated
              ? "bg-white/10"
              : index < lives
                ? "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.32)]"
                : swimming && index === 0
                  ? "bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.3)]"
                  : "bg-white/10"
          )}
        />
      ))}
    </div>
  );
}

function generateDefaultPlayerName() {
  return createCustomId({
    adjectives: 1,
    subject: true,
    numberSuffix: 3,
    delimiter: "-"
  });
}

function currentTurnPlayer(snapshot: RoomSnapshot) {
  return snapshot.players.find((player) => player.isCurrentTurn);
}

function playerName(snapshot: RoomSnapshot, playerId?: string) {
  return snapshot.players.find((player) => player.id === playerId)?.name ?? "A player";
}

function tableStatusCopy(snapshot: RoomSnapshot, isMyTurn: boolean, selfName?: string) {
  const activeTurn = currentTurnPlayer(snapshot);

  if (snapshot.phase === "lobby") {
    return snapshot.players.length < 2
      ? "Invite another player before starting the round."
      : "Ready when the host starts the round.";
  }

  if (snapshot.phase === "round-over") {
    return "Cards are revealed. The next round starts automatically.";
  }

  if (snapshot.phase === "game-over") {
    return `${playerName(snapshot, snapshot.winnerId)} wins the table.`;
  }

  if (isMyTurn) {
    return snapshot.knockingPlayerId
      ? "Final turn pressure. Improve your hand before the reveal."
      : "Choose a trade, sweep the market, pass, or knock.";
  }

  return activeTurn ? `${activeTurn.name} is deciding.` : `${selfName ?? "Your table"} is waiting for the next move.`;
}

function selectedTradeCopy(handCard?: Card, marketCard?: Card) {
  if (handCard && marketCard) {
    return `Ready to trade ${cardName(handCard)} for ${cardName(marketCard)}.`;
  }
  if (handCard) {
    return `Selected ${cardName(handCard)} from your hand. Pick a center card.`;
  }
  if (marketCard) {
    return `Selected ${cardName(marketCard)} from the center. Pick one of your cards.`;
  }
  return "Select one card from your hand and one from the center.";
}

function noticeForAction(message: string): { title: string; detail: string; tone: NoticeTone; sound?: SoundCue } {
  if (message.includes("knocked")) {
    return { title: "Knock called", detail: message, tone: "warning", sound: "warning" };
  }
  if (message.includes("reveals") || message.includes("Fire")) {
    return { title: "Immediate reveal", detail: message, tone: "warning", sound: "round" };
  }
  if (message.includes("swept") || message.includes("traded")) {
    return { title: "Cards moved", detail: message, tone: "neutral", sound: "select" };
  }
  if (message.includes("passed") || message.includes("refreshed")) {
    return { title: "Table flow", detail: message, tone: "neutral" };
  }
  if (message.includes("wins")) {
    return { title: "Winner", detail: message, tone: "success", sound: "game" };
  }
  return { title: "Table update", detail: message, tone: "neutral" };
}

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
  dimmed,
  disabled
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  dimmed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "card-face relative flex h-40 w-28 flex-col justify-between overflow-hidden rounded-[12px] border px-2.5 py-2.5 text-left transition duration-300",
        selected ? "border-cyan-400 -translate-y-3 rotate-[-2deg]" : "border-stone-200/80 hover:-translate-y-2",
        dimmed && "opacity-55 grayscale",
        disabled && "cursor-not-allowed hover:translate-y-0"
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
          <div>{playerLifeLabel(player)}</div>
        </div>
      </div>
      <LifePips lives={player.lives} swimming={player.swimming} eliminated={player.eliminated} className="mt-3" />
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

function NoticeStack({ notices, className }: { notices: Notice[]; className?: string }) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <div className={cn("z-40 flex w-[min(360px,calc(100%-1.5rem))] flex-col gap-3", className)}>
      {notices.map((notice) => (
        <div key={notice.id} className={cn("notice-card hud-panel px-4 py-3", NOTICE_STYLE[notice.tone])}>
          <div className="flex items-start gap-3">
            <span className={cn("notice-dot mt-2 h-2.5 w-2.5 shrink-0 rounded-full", notice.tone)} />
            <div className="min-w-0">
              <div className="font-semibold leading-5">{notice.title}</div>
              {notice.detail ? <div className="mt-1 text-sm leading-5 text-white/72">{notice.detail}</div> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [name, setName] = useState(generateDefaultPlayerName);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [selected, setSelected] = useState<ActionState>({ handIndex: null, marketIndex: null });
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(socket.connected ? "online" : "connecting");
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const noticeIdRef = useRef(0);
  const lastActionRef = useRef<string | undefined>(undefined);
  const previousSnapshotRef = useRef<RoomSnapshot | null>(null);
  const pendingRequestRef = useRef<PendingRequest | null>(null);
  const hasConnectedRef = useRef(socket.connected);
  const audioContextRef = useRef<AudioContext | null>(null);

  const self = snapshot?.players.find((player) => player.id === snapshot.selfId);
  const isMyTurn = Boolean(self?.isCurrentTurn && snapshot?.phase === "playing");
  const myScore = scoreHand(snapshot?.hand ?? []);
  const selectedHandCard = selected.handIndex === null ? undefined : snapshot?.hand[selected.handIndex];
  const selectedMarketCard = selected.marketIndex === null ? undefined : snapshot?.market[selected.marketIndex];

  const setPending = useCallback((request: PendingRequest | null) => {
    pendingRequestRef.current = request;
    setPendingRequest(request);
  }, []);

  const playSound = useCallback(
    (cue: SoundCue) => {
      if (!soundEnabled || typeof window === "undefined") {
        return;
      }

      try {
        const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
        const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
        if (!AudioContextConstructor) {
          return;
        }

        const context = audioContextRef.current ?? new AudioContextConstructor();
        audioContextRef.current = context;

        if (context.state === "suspended") {
          void context.resume();
        }

        const startAt = context.currentTime + 0.015;
        for (const note of SOUND_PATTERNS[cue]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = startAt + note.offset;
          const noteEnd = noteStart + note.duration;

          oscillator.type = note.type ?? "sine";
          oscillator.frequency.setValueAtTime(note.frequency, noteStart);
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(note.gain ?? 0.035, noteStart + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        }
      } catch {
        // Sound is enhancement-only; browser autoplay/audio restrictions should never interrupt play.
      }
    },
    [soundEnabled]
  );

  const pushNotice = useCallback(
    (title: string, detail?: string, tone: NoticeTone = "neutral", sound?: SoundCue) => {
      const id = noticeIdRef.current + 1;
      noticeIdRef.current = id;
      setNotices((current) => [{ id, title, detail, tone }, ...current].slice(0, 5));
      if (sound) {
        playSound(sound);
      }
      window.setTimeout(
        () => {
          setNotices((current) => current.filter((notice) => notice.id !== id));
        },
        tone === "action" ? 4200 : tone === "danger" ? 6500 : 5400
      );
    },
    [playSound]
  );

  const showError = useCallback(
    (title: string, detail?: string) => {
      setError(detail ?? title);
      pushNotice(title, detail, "danger", "error");
    },
    [pushNotice]
  );

  useEffect(() => {
    socket.emit("player:upsert", { name: name.trim() || "Player" }, () => undefined);
    socket.emit("room:list", (roomList) => setRooms(roomList));

    const handleSnapshot = (nextSnapshot: RoomSnapshot) => {
      setSnapshot(nextSnapshot);
      setSelected({ handIndex: null, marketIndex: null });
    };

    const handleRoomList = (roomList: PublicRoomInfo[]) => setRooms(roomList);
    const handleError = (payload: { error: string }) => showError("Table error", payload.error);

    socket.on("room:snapshot", handleSnapshot);
    socket.on("room:list", handleRoomList);
    socket.on("room:error", handleError);

    return () => {
      socket.off("room:snapshot", handleSnapshot);
      socket.off("room:list", handleRoomList);
      socket.off("room:error", handleError);
    };
  }, [name, showError]);

  useEffect(() => {
    const handleConnect = () => {
      setConnectionStatus("online");
      if (hasConnectedRef.current) {
        pushNotice("Reconnected", "Live table updates are back.", "success", "success");
      }
      hasConnectedRef.current = true;
    };

    const handleDisconnect = () => {
      setConnectionStatus("offline");
      pushNotice("Connection lost", "Trying to reconnect to the table.", "warning", "warning");
    };

    const handleConnectError = () => {
      setConnectionStatus("offline");
      pushNotice("Server unreachable", "Live updates are paused until the socket reconnects.", "danger", "error");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [pushNotice]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const previous = previousSnapshotRef.current;
    const selfPlayer = snapshot.players.find((player) => player.id === snapshot.selfId);

    if (!previous) {
      if (!pendingRequestRef.current) {
        pushNotice(
          "You're seated",
          snapshot.options.isPrivate ? `Share room code ${snapshot.code}.` : `${snapshot.players.length}/${snapshot.options.maxPlayers} seats filled.`,
          "success",
          "join"
        );
      }
      previousSnapshotRef.current = snapshot;
      lastActionRef.current = snapshot.lastAction;
      setPending(null);
      return;
    }

    const previousPlayersById = new Map(previous.players.map((player) => [player.id, player]));
    const previousSelf = previous.players.find((player) => player.id === previous.selfId);
    const onlinePlayerCount = snapshot.players.filter((player) => player.connected && !player.eliminated).length;

    for (const player of snapshot.players) {
      const previousPlayer = previousPlayersById.get(player.id);
      if (!previousPlayer && player.id !== snapshot.selfId) {
        pushNotice(
          `${player.name} joined`,
          `${onlinePlayerCount}/${snapshot.options.maxPlayers} active seats.`,
          "success",
          "join"
        );
      } else if (previousPlayer && previousPlayer.connected !== player.connected && player.id !== snapshot.selfId) {
        pushNotice(
          player.connected ? `${player.name} returned` : `${player.name} disconnected`,
          player.connected ? "They are back at the table." : "Their seat stays reserved for now.",
          player.connected ? "success" : "warning",
          player.connected ? "join" : "warning"
        );
      } else if (previousPlayer && !previousPlayer.eliminated && player.eliminated && player.id !== snapshot.selfId) {
        pushNotice(`${player.name} is out`, "One fewer player remains at the table.", "warning", "warning");
      }
    }

    if (previousSelf && selfPlayer && previous.phase !== snapshot.phase && (snapshot.phase === "round-over" || snapshot.phase === "game-over")) {
      if (!previousSelf.eliminated && selfPlayer.eliminated) {
        pushNotice("You're out", "Your seat is now spectating the rest of the table.", "danger", "warning");
      } else if (!previousSelf.swimming && selfPlayer.swimming) {
        pushNotice("You're swimming", "No lives left. The next lost round eliminates you.", "warning", "warning");
      } else if (selfPlayer.lives < previousSelf.lives) {
        pushNotice("Life lost", `${plural(selfPlayer.lives, "life", "lives")} remaining.`, "warning", "warning");
      }
    }

    const phaseChanged = previous.phase !== snapshot.phase;
    if (phaseChanged) {
      const turnPlayer = currentTurnPlayer(snapshot);
      if (snapshot.phase === "playing") {
        pushNotice(
          `Round ${snapshot.roundNumber} started`,
          turnPlayer ? `${turnPlayer.id === snapshot.selfId ? "You have" : `${turnPlayer.name} has`} the first move.` : "Cards are dealt.",
          "success",
          "round"
        );
      } else if (snapshot.phase === "round-over") {
        const scoreDetail = typeof selfPlayer?.score === "number" ? `Your reveal: ${scoreLabel(selfPlayer.score)}.` : undefined;
        pushNotice("Round over", [scoreDetail, snapshot.lastAction].filter(Boolean).join(" "), "warning", "round");
      } else if (snapshot.phase === "game-over") {
        pushNotice(
          "Table finished",
          `${playerName(snapshot, snapshot.winnerId)} wins the table.`,
          snapshot.winnerId === snapshot.selfId ? "success" : "warning",
          "game"
        );
      }
    }

    if (snapshot.lastAction && snapshot.lastAction !== lastActionRef.current) {
      const skipRoundStart = phaseChanged && snapshot.lastAction === "A new round begins.";
      const skipResolvedPhaseAction = phaseChanged && (snapshot.phase === "round-over" || snapshot.phase === "game-over");
      if (!skipRoundStart && !skipResolvedPhaseAction) {
        const notice = noticeForAction(snapshot.lastAction);
        pushNotice(notice.title, notice.detail, notice.tone, notice.sound);
      }
      lastActionRef.current = snapshot.lastAction;
    }

    const turnPlayer = currentTurnPlayer(snapshot);
    const previousTurnPlayer = currentTurnPlayer(previous);
    if (snapshot.phase === "playing" && turnPlayer?.id !== previousTurnPlayer?.id) {
      if (turnPlayer?.id === snapshot.selfId) {
        pushNotice(
          snapshot.knockingPlayerId ? "Your last-chance turn" : "Your turn",
          snapshot.knockingPlayerId
            ? "The round is closing. Make this move count."
            : selectedTradeCopy(selectedHandCard, selectedMarketCard),
          "action",
          "turn"
        );
      } else if (previousTurnPlayer?.id === snapshot.selfId && turnPlayer) {
        pushNotice("Move locked", `${turnPlayer.name} is up next.`, "neutral");
      }
    }

    previousSnapshotRef.current = snapshot;
  }, [pushNotice, selectedHandCard, selectedMarketCard, setPending, snapshot]);

  const createRoom = (isPrivate: boolean) => {
    const request: PendingRequest = isPrivate ? "create-private" : "create-public";
    setPending(request);
    setError(null);
    playSound("select");
    socket.emit(
      "room:create",
      { name: name.trim() || "Player", isPrivate, maxPlayers: 6, allowPass: true },
      ({ code }) => {
        setPending(null);
        setError(null);
        pushNotice(isPrivate ? "Private table ready" : "Public table ready", `Room code ${code}.`, "success", "join");
      }
    );
  };

  const quickplay = () => {
    setPending("quickplay");
    setError(null);
    playSound("select");
    socket.emit("room:quickplay", { name: name.trim() || "Player" }, ({ code }) => {
      setPending(null);
      setError(null);
      pushNotice("Quickplay seat found", `You're seated at room ${code}.`, "success", "join");
    });
  };

  const joinRoom = (roomIdOrCode: string) => {
    const trimmedRoom = roomIdOrCode.trim().toUpperCase();
    if (!trimmedRoom) {
      showError("Room code required", "Enter a room code before joining.");
      return;
    }

    setPending("join-room");
    setError(null);
    playSound("select");
    socket.emit("room:join", { roomIdOrCode: trimmedRoom, name: name.trim() || "Player" }, (response) => {
      setPending(null);
      if (!response.ok) {
        showError("Couldn't join table", response.error ?? "Unable to join room.");
        return;
      }
      setError(null);
      setRoomCodeInput("");
      pushNotice("Joined table", `You're now seated in room ${trimmedRoom}.`, "success", "join");
    });
  };

  const startGame = () => {
    setPending("start-game");
    setError(null);
    playSound("select");
    socket.emit("game:start", (response) => {
      setPending(null);
      if (!response.ok) {
        showError("Couldn't start round", response.error ?? "Unable to start game.");
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
    setPending("game-action");
    setError(null);
    playSound("select");
    socket.emit("game:action", action, (response) => {
      setPending(null);
      if (!response.ok) {
        showError("Move rejected", response.error ?? "Action failed.");
        return;
      }
      setError(null);
    });
  };

  const tableSeats = snapshot ? snapshot.players.filter((player) => player.id !== snapshot.selfId).slice(0, 5) : [];
  const seatedPlayerCount = snapshot ? snapshot.players.filter((player) => !player.eliminated).length : 0;
  const activeTurn = snapshot ? currentTurnPlayer(snapshot) : undefined;
  const connectionLabel =
    connectionStatus === "online" ? "Live" : connectionStatus === "connecting" ? "Connecting" : "Reconnecting";
  const hasPendingRequest = pendingRequest !== null;
  const isSubmittingMove = pendingRequest === "game-action";

  if (!snapshot) {
    return (
      <main className="relative min-h-screen overflow-hidden px-6 py-8 text-white">
        <TableBackdrop />
        <NoticeStack notices={notices} className="fixed right-4 top-4 md:right-6 md:top-6" />
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="pill">{connectionLabel}</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((current) => !current)}
                  className="pill hover:border-cyan-100/45 hover:bg-cyan-100/15"
                >
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </button>
              </div>
              <label className="mt-6 block text-sm uppercase tracking-[0.2em] text-white/60">Name At The Table</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field-input mt-2"
              />
              <div className="mt-6 grid gap-3">
                <button
                  onClick={() => createRoom(true)}
                  disabled={hasPendingRequest}
                  className="action-btn action-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingRequest === "create-private" ? "Opening Private Table..." : "Open A Private Table"}
                </button>
                <button
                  onClick={() => createRoom(false)}
                  disabled={hasPendingRequest}
                  className="action-btn action-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingRequest === "create-public" ? "Opening Public Table..." : "Open A Public Table"}
                </button>
                <button
                  onClick={quickplay}
                  disabled={hasPendingRequest}
                  className="action-btn action-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingRequest === "quickplay" ? "Finding A Seat..." : "Join The Next Open Seat"}
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
                    disabled={hasPendingRequest}
                    className="action-btn action-secondary whitespace-nowrap"
                  >
                    {pendingRequest === "join-room" ? "Joining..." : "Join"}
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
                      disabled={hasPendingRequest}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>
                        <span className="block font-display text-xl text-cyan-50">{room.code}</span>
                        <span className="block text-sm text-white/55">{room.playerCount}/{room.maxPlayers} seated</span>
                      </span>
                      <span className="pill">{phaseLabel(room.phase)}</span>
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
          <div className="absolute left-3 top-3 z-30 w-[min(420px,calc(100%-1.5rem))] md:left-6 md:top-6">
            <div className="hud-panel p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill">Room {snapshot.code}</span>
                <span className="pill">Round {snapshot.roundNumber || 0}</span>
                <span className="pill">{phaseLabel(snapshot.phase)}</span>
                <span className="pill">Seats {seatedPlayerCount}/{snapshot.options.maxPlayers}</span>
                <span className="pill">{connectionLabel}</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((current) => !current)}
                  className="pill hover:border-cyan-100/45 hover:bg-cyan-100/15"
                >
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-display text-2xl text-cyan-50">Wutz Table</div>
                  <div className="mt-1 text-sm text-white/65">
                    {tableStatusCopy(snapshot, isMyTurn, self?.name)}
                  </div>
                </div>
                {snapshot.phase === "lobby" ? (
                  <button
                    onClick={startGame}
                    disabled={!self?.isHost || pendingRequest === "start-game"}
                    className="action-btn action-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pendingRequest === "start-game" ? "Starting..." : self?.isHost ? "Start" : "Host Starts"}
                  </button>
                ) : null}
              </div>
              {error ? <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
            </div>
          </div>

          <NoticeStack notices={notices} className="absolute right-3 top-3 md:right-6 md:top-6" />

          <div className="absolute bottom-3 left-3 z-20 w-[min(320px,calc(100%-1.5rem))] md:bottom-6 md:left-6">
            <div className="hud-panel p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">At A Glance</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/78">
                <div>Hand: {snapshot.hand.length === 3 ? scoreLabel(myScore) : "..."}</div>
                <div>Deck: {snapshot.drawCount}</div>
                <div>Discard: {snapshot.discardCount}</div>
                <div>Passes: {snapshot.consecutivePasses}</div>
                <div>Seats: {seatedPlayerCount}/{snapshot.options.maxPlayers}</div>
                <div>Your lives: {playerLifeLabel(self)}</div>
                <div>Players in: {snapshot.activePlayerCount}</div>
                <div>{snapshot.options.allowPass ? "Passing allowed" : "No passing"}</div>
              </div>
              {snapshot.knockingPlayerId ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                  {playerName(snapshot, snapshot.knockingPlayerId)} knocked.{" "}
                  {snapshot.finalTurnsRemaining > 0
                    ? `${plural(snapshot.finalTurnsRemaining, "final turn")} left before the reveal.`
                    : "The reveal is coming up."}
                </div>
              ) : null}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-20 w-[min(320px,calc(100%-1.5rem))] md:bottom-6 md:right-6">
            <div className="hud-panel p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Your Move</div>
              <div className="mt-2 text-sm leading-5 text-white/70">
                {isMyTurn
                  ? selectedTradeCopy(selectedHandCard, selectedMarketCard)
                  : activeTurn
                    ? `Waiting on ${activeTurn.name}.`
                    : "Waiting for the next move."}
              </div>
              <div className="mt-3 grid gap-3">
                <button
                  disabled={!isMyTurn || isSubmittingMove || selected.handIndex === null || selected.marketIndex === null}
                  onClick={() =>
                    submitAction({
                      type: "swap-one",
                      handIndex: selected.handIndex!,
                      marketIndex: selected.marketIndex!
                    })
                  }
                  className="action-btn action-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmittingMove ? "Sending..." : "Trade Selected"}
                </button>
                <button
                  disabled={!isMyTurn || isSubmittingMove}
                  onClick={() => submitAction({ type: "swap-all" })}
                  className="action-btn action-secondary w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Take All Three
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={!isMyTurn || isSubmittingMove || !snapshot.options.allowPass}
                    onClick={() => submitAction({ type: "pass" })}
                    className="action-btn action-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pass
                  </button>
                  <button
                    disabled={!isMyTurn || isSubmittingMove}
                    onClick={() => submitAction({ type: "knock" })}
                    className="action-btn action-warning disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Knock
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[780px] flex-col justify-between pb-44 pt-72 sm:pt-64 md:min-h-[800px] md:pb-48 md:pt-60 lg:pt-56">
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
                    onClick={() => {
                      playSound("select");
                      setSelected((current) => ({ ...current, marketIndex: index }));
                    }}
                    dimmed={!isMyTurn}
                    disabled={!isMyTurn || isSubmittingMove}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/55">Your Cards</div>
                  <div className="mt-1 font-display text-2xl text-cyan-50">{self?.name}</div>
                  {self ? (
                    <div className="hud-panel mt-3 w-[min(18rem,100%)] px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-white/45">Your Lives</div>
                        <div className="font-display text-lg text-cyan-50">{playerLifeLabel(self)}</div>
                      </div>
                      <LifePips
                        lives={self.lives}
                        swimming={self.swimming}
                        eliminated={self.eliminated}
                        className="mt-2"
                        pipClassName="h-2.5 flex-1"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  <span className="pill">{isMyTurn ? "Your turn" : "Waiting"}</span>
                  <span className="pill">{playerRoleLabel(self, snapshot.options.maxPlayers)}</span>
                </div>
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
                      onClick={() => {
                        playSound("select");
                        setSelected((current) => ({ ...current, handIndex: index }));
                      }}
                      dimmed={!isMyTurn}
                      disabled={!isMyTurn || isSubmittingMove}
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

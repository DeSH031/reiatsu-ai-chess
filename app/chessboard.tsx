"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type PositionDataType } from "react-chessboard";
import { supabase } from "@/lib/supabaseClient";
import { getProfile, updateProfileStats } from "@/lib/auth";
import {
  applyGameResultReiatsu,
  calculateMoveImpact,
  createInitialReiatsuState,
  updateReiatsu,
  type GameStateReiatsu,
  type MoveQualityTag,
  type MoveReiatsuEvent,
  type PlayerSide,
  type ReiatsuHistoryEvent,
} from "./reiatsu";
import {
  compareMoveToBest,
} from "./compare-move-to-best";
import { classifyMove, type MoveQuality } from "./classify-move";
import { evaluateMaterial } from "./evaluate-material";
import { isBlunder } from "./is-blunder";

const INITIAL_FEN = new Chess().fen();
const CHESSBOARD_BOARD_STYLE = {
  border: "none",
  borderRadius: "0",
  boxShadow: "none",
  padding: "0",
  margin: "0",
  gap: "0",
  background: "transparent",
} as const;
const CHESSBOARD_SQUARE_STYLE = {
  border: "none",
  borderRadius: "0",
  boxShadow: "none",
  margin: "0",
  padding: "0",
} as const;
const CHESSBOARD_LIGHT_SQUARE_STYLE = {
  backgroundColor: "#F0D9B5",
  border: "none",
  borderRadius: "0",
  boxShadow: "none",
} as const;
const CHESSBOARD_DARK_SQUARE_STYLE = {
  backgroundColor: "#B58863",
  border: "none",
  borderRadius: "0",
  boxShadow: "none",
} as const;
const CHESSBOARD_DROP_SQUARE_STYLE = {
  boxShadow: "none",
  border: "none",
} as const;

type BoardOrientation = "white" | "black";
type GameMode = "pvp" | "ai";
type GameStatus = "active" | "checkmate" | "stalemate" | "draw";
type PromotionPiece = "q" | "r" | "b" | "n";
type PendingPromotionMove = {
  from: string;
  to: string;
};
type BlunderModalState = {
  open: boolean;
  message: string;
};
type AnalysisFeedbackState = {
  open: boolean;
  detail: "Next alternative" | "Last move";
  nextMovesShown: number | null;
};
type CoachReviewModalState = {
  open: boolean;
};
type PendingMove = {
  from: string;
  to: string;
  fenBefore: string;
  promotion?: string;
};
type ThinkingSessionState = {
  open: boolean;
  snapshotFen: string;
};
type AnalysisStep = "count" | "showMoves" | "done";
type GlobalGameState = {
  gameStatus: GameStatus;
  gameOver: boolean;
};

type CurrentGameRow = {
  fen: string;
  game_mode: GameMode | null;
  move_history: unknown;
};

type MatchHistoryResult = Exclude<GameStatus, "active">;

type MatchHistoryPayload = {
  user_id: string;
  opponent_type: string;
  reiatsu_before: number | null;
  reiatsu_after: number | null;
  reiatsu_delta: number | null;
  final_fen: string;
  move_history: string[];
  game_mode: GameMode;
  result: MatchHistoryResult;
  winner: PlayerSide | null;
  player_color: BoardOrientation | null;
  ai_difficulty: string | null;
  reiatsu_change: number | null;
  coach_summary: PersistedCoachSummary | null;
};

type ChessboardPanelProps = {
  onMatchSaved?: () => void;
  onProfileUpdated?: () => void;
  totalReiatsu?: number;
  onTotalReiatsuChange?: (nextTotalReiatsu: number) => void;
};

type CoachMoveLabel =
  | "Great"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Blunder";

type CoachMoveHighlight = {
  moveNumber: number;
  san: string;
  label: CoachMoveLabel;
  explanation: string;
  totalDelta: number;
  betterMoveSan: string | null;
};

type CoachSummary = {
  bestMove: CoachMoveHighlight | null;
  biggestMistake: CoachMoveHighlight | null;
  overallAssessment: string;
};

type PersistedCoachSummary = {
  overallAssessment: string;
  bestMove: {
    moveNumber: number;
    notation: string;
    label: string;
    reason: string;
  } | null;
  biggestMistake: {
    moveNumber: number;
    playedMove: string;
    betterMove: string;
    label: string;
    reason: string;
  } | null;
};

function GameStatusBanner({ gameStatus }: { gameStatus: GameStatus }) {
  if (gameStatus === "active") return null;

  const labelByStatus: Record<Exclude<GameStatus, "active">, string> = {
    checkmate: "Checkmate",
    stalemate: "Stalemate",
    draw: "Draw",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      Game Over: {labelByStatus[gameStatus]}
    </div>
  );
}

function getModeButtonClassName(isActive: boolean): string {
  return isActive
    ? "w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white sm:w-auto dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
    : "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
}

function pickRandomMove<T>(moves: T[]): T {
  return moves[Math.floor(Math.random() * moves.length)];
}

function getNextTriggerMove(currentMoveCount: number): number {
  return currentMoveCount + 7 + Math.floor(Math.random() * 4);
}

function toSquare(rank: number, file: number): string {
  return `${String.fromCharCode(97 + file)}${8 - rank}`;
}

function generateLegalMovesFromPosition(position: Chess) {
  return position.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  }));
}

function getBoardPosition(position: Chess): PositionDataType {
  const map: PositionDataType = {};
  const pieceCodeMap: Record<string, string> = {
    p: "P",
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
  };

  const board = position.board();
  for (let rank = 0; rank < board.length; rank++) {
    for (let file = 0; file < board[rank].length; file++) {
      const piece = board[rank][file];
      if (!piece) continue;

      map[toSquare(rank, file)] = {
        pieceType: `${piece.color}${pieceCodeMap[piece.type]}`,
      };
    }
  }

  return map;
}

function checkGameStatus(board: Chess): GameStatus {
  if (board.isCheckmate()) return "checkmate";
  if (board.isStalemate()) return "stalemate";
  if (board.isDraw()) return "draw";
  return "active";
}

function getWinnerForStatus(
  status: MatchHistoryResult,
  board: Chess
): PlayerSide | null {
  if (status !== "checkmate") {
    return null;
  }

  return board.turn() === "w" ? "black" : "white";
}

function normalizeStoredMoveHistory(moveHistory: unknown): string[] {
  if (Array.isArray(moveHistory)) {
    return moveHistory.flatMap((move) => {
      if (typeof move === "string") {
        return move;
      }

      if (
        typeof move === "object" &&
        move !== null &&
        "san" in move &&
        typeof move.san === "string"
      ) {
        return move.san;
      }

      return [];
    });
  }

  if (typeof moveHistory === "string") {
    try {
      return normalizeStoredMoveHistory(JSON.parse(moveHistory));
    } catch {
      return moveHistory.trim() ? [moveHistory] : [];
    }
  }

  return [];
}

function isMoveReiatsuEvent(
  event: ReiatsuHistoryEvent
): event is MoveReiatsuEvent {
  return !("type" in event);
}

function getCoachMoveLabel(qualityTag: MoveQualityTag): CoachMoveLabel {
  switch (qualityTag) {
    case "forced_tactic_win":
    case "best":
      return "Great";
    case "good":
    case "neutral":
      return "Good";
    case "inaccuracy":
      return "Inaccuracy";
    case "mistake":
      return "Mistake";
    case "blunder":
      return "Blunder";
  }
}

function getCoachMoveExplanation(event: MoveReiatsuEvent): string {
  switch (event.qualityTag) {
    case "forced_tactic_win":
      return "This move created a strong tactical chance.";
    case "best":
      return "This move improved your position.";
    case "good":
      return "This move helped you coordinate your pieces.";
    case "inaccuracy":
      return "This move gave away some of your edge.";
    case "mistake":
      return "This move allowed your opponent active counterplay.";
    case "blunder":
      return "You lost material here.";
    case "neutral":
      return event.positionDelta >= 0
        ? "This move kept your position stable."
        : "This move made the position a little harder.";
  }
}

function toCoachMoveHighlight(event: MoveReiatsuEvent): CoachMoveHighlight {
  return {
    moveNumber: event.moveNumber,
    san: event.san ?? "Unknown move",
    label: getCoachMoveLabel(event.qualityTag),
    explanation: getCoachMoveExplanation(event),
    totalDelta: event.totalDelta,
    betterMoveSan: null,
  };
}

function getMoveContextAtMove(
  moveHistory: string[],
  moveNumber: number
): {
  fenBefore: string;
  playedMove: {
    from: string;
    to: string;
    promotion?: string;
    san?: string;
  };
} | null {
  if (moveNumber < 1 || moveNumber > moveHistory.length) {
    return null;
  }

  const board = new Chess();

  for (let index = 0; index < moveHistory.length; index++) {
    const fenBefore = board.fen();
    const move = board.move(moveHistory[index]);

    if (!move) {
      return null;
    }

    if (index === moveNumber - 1) {
      return {
        fenBefore,
        playedMove: {
          from: move.from,
          to: move.to,
          promotion: move.promotion,
          san: move.san,
        },
      };
    }
  }

  return null;
}

function getBetterMoveSanForEvent(
  event: MoveReiatsuEvent,
  moveHistory: string[]
): string | null {
  const moveContext = getMoveContextAtMove(moveHistory, event.moveNumber);

  if (!moveContext) {
    return null;
  }

  const comparison = compareMoveToBest(moveContext.fenBefore, moveContext.playedMove);
  const bestMove = comparison.bestMove;

  if (!bestMove) {
    return null;
  }

  const isSameAsPlayedMove =
    bestMove.from === moveContext.playedMove.from &&
    bestMove.to === moveContext.playedMove.to &&
    bestMove.promotion === moveContext.playedMove.promotion;

  if (isSameAsPlayedMove) {
    return null;
  }

  if (bestMove.san?.trim()) {
    return bestMove.san;
  }

  return `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ""}`;
}

function buildCoachSummary(
  history: ReiatsuHistoryEvent[],
  gameStatus: GameStatus,
  playerSide: PlayerSide,
  winner: PlayerSide | null,
  moveHistory: string[]
): CoachSummary | null {
  const playerMoveEvents = history
    .filter(isMoveReiatsuEvent)
    .filter((event) => event.player === playerSide);

  if (playerMoveEvents.length === 0) {
    return null;
  }

  const bestMoveEvent = playerMoveEvents.reduce((bestEvent, currentEvent) =>
    currentEvent.totalDelta > bestEvent.totalDelta ? currentEvent : bestEvent
  );
  const biggestMistakeEvent = playerMoveEvents.reduce((worstEvent, currentEvent) =>
    currentEvent.totalDelta < worstEvent.totalDelta ? currentEvent : worstEvent
  );

  const blunders = playerMoveEvents.filter(
    (event) => event.qualityTag === "blunder"
  ).length;
  const mistakes = playerMoveEvents.filter(
    (event) => event.qualityTag === "mistake"
  ).length;
  const strongMoves = playerMoveEvents.filter(
    (event) =>
      event.qualityTag === "good" ||
      event.qualityTag === "best" ||
      event.qualityTag === "forced_tactic_win"
  ).length;

  let overallAssessment = "A steady game overall, with room for sharper choices.";

  if (gameStatus === "draw" || gameStatus === "stalemate") {
    overallAssessment =
      blunders === 0 && mistakes === 0
        ? "You held the balance well and kept the game under control."
        : "You fought hard, but a few slips kept the game from turning in your favor.";
  } else if (winner === playerSide) {
    overallAssessment =
      strongMoves >= 2
        ? "You found several useful moves and converted your chances well."
        : "You finished the game cleanly and made the key moments count.";
  } else if (blunders > 0) {
    overallAssessment =
      "You created chances, but one major mistake changed the direction of the game.";
  } else if (mistakes > 0) {
    overallAssessment =
      "You had playable positions, but a few mistakes gave your opponent the edge.";
  }

  const biggestMistake = toCoachMoveHighlight(biggestMistakeEvent);
  biggestMistake.betterMoveSan = getBetterMoveSanForEvent(
    biggestMistakeEvent,
    moveHistory
  );

  return {
    bestMove: toCoachMoveHighlight(bestMoveEvent),
    biggestMistake,
    overallAssessment,
  };
}

function serializeCoachSummary(
  summary: CoachSummary | null
): PersistedCoachSummary | null {
  if (!summary) {
    return null;
  }

  return {
    overallAssessment: summary.overallAssessment,
    bestMove: summary.bestMove
      ? {
          moveNumber: summary.bestMove.moveNumber,
          notation: summary.bestMove.san,
          label: summary.bestMove.label,
          reason: summary.bestMove.explanation,
        }
      : null,
    biggestMistake: summary.biggestMistake
      ? {
          moveNumber: summary.biggestMistake.moveNumber,
          playedMove: summary.biggestMistake.san,
          betterMove: summary.biggestMistake.betterMoveSan ?? "not available",
          label: summary.biggestMistake.label,
          reason: summary.biggestMistake.explanation,
        }
      : null,
  };
}

export default function ChessboardPanel({
  onMatchSaved,
  onProfileUpdated,
  totalReiatsu = 0,
  onTotalReiatsuChange,
}: ChessboardPanelProps) {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(INITIAL_FEN);
  const [boardOrientation, setBoardOrientation] =
    useState<BoardOrientation>("white");
  const [gameMode, setGameMode] = useState<GameMode>("pvp");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [pendingPromotionMove, setPendingPromotionMove] =
    useState<PendingPromotionMove | null>(null);
  const [selectedPromotionPiece, setSelectedPromotionPiece] =
    useState<PromotionPiece | null>(null);
  const [blunderModal, setBlunderModal] = useState<BlunderModalState>({
    open: false,
    message: "",
  });
  const [analysisFeedback, setAnalysisFeedback] = useState<AnalysisFeedbackState>(
    {
      open: false,
      detail: "Next alternative",
      nextMovesShown: null,
    }
  );
  const [coachReviewModal, setCoachReviewModal] =
    useState<CoachReviewModalState>({
      open: false,
    });
  const [moveCount, setMoveCount] = useState(0);
  const [nextTriggerMove, setNextTriggerMove] = useState(() =>
    getNextTriggerMove(0)
  );
  const [thinkingSession, setThinkingSession] = useState<ThinkingSessionState>({
    open: false,
    snapshotFen: "",
  });
  const [, setPreMoveFen] = useState<string | null>(null);
  const [postMoveFen, setPostMoveFen] = useState<string | null>(null);
  const [analysisSnapshotFen, setAnalysisSnapshotFen] = useState<string | null>(
    null
  );
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [analysisPlayerColor, setAnalysisPlayerColor] =
    useState<BoardOrientation | null>(null);
  const [expectedMovesCount, setExpectedMovesCount] = useState<number | null>(
    null
  );
  const [currentStep, setCurrentStep] = useState<AnalysisStep>("done");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [movesShown, setMovesShown] = useState(0);
  const [movesCountInput, setMovesCountInput] = useState("");
  const [moveQuality, setMoveQuality] = useState<MoveQuality | null>(null);
  const [globalGameState, setGlobalGameState] = useState<GlobalGameState>({
    gameStatus: "active",
    gameOver: false,
  });
  const [reiatsuState, setReiatsuState] = useState<GameStateReiatsu>(
    createInitialReiatsuState()
  );

  const moveHistoryRef = useRef<string[]>([]);
  const moveHistoryPanelRef = useRef<HTMLDivElement | null>(null);
  const reiatsuStateRef = useRef<GameStateReiatsu>(createInitialReiatsuState());
  const aiMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisSectionRef = useRef<HTMLDivElement | null>(null);
  const coachSummarySectionRef = useRef<HTMLElement | null>(null);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const latestSaveRequestIdRef = useRef(0);
  const lastRequestedSaveStateKeyRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const savedCompletedMatchKeyRef = useRef<string | null>(null);
  const initialAIMoveTriggeredRef = useRef(false);
  const shownCoachReviewGameKeyRef = useRef<string | null>(null);
  const isBlunderModalOpen = blunderModal.open;
  const isThinkingSessionOpen = thinkingSession.open;
  const isAnalysisFeedbackOpen = analysisFeedback.open;
  const analysisNextMovesShown = analysisFeedback.nextMovesShown;
  const setCurrentGame = useCallback((nextGame: Chess) => {
    gameRef.current = nextGame;
  }, []);
  const { gameStatus, gameOver } = globalGameState;
  const evaluationScore = evaluateMaterial(fen);
  const boardPosition = getBoardPosition(new Chess(fen));
  const gameWinner =
    gameStatus === "checkmate"
      ? getWinnerForStatus(gameStatus, new Chess(fen))
      : null;
  const coachSummary = (() => {
    if (!gameOver) {
      return null;
    }

    try {
      return buildCoachSummary(
        reiatsuState.history,
        gameStatus,
        boardOrientation,
        gameWinner,
        moveHistory
      );
    } catch (error) {
      console.error("Post-game coach summary failed", error);
      return null;
    }
  })();
  const coachReviewGameKey =
    gameOver && coachSummary
      ? `${fen}::${moveHistory.length}::${gameStatus}`
      : null;
  const analysisBoardPosition = analysisFen
    ? getBoardPosition(new Chess(analysisFen))
    : null;
  const moveRows = moveHistory.reduce<
    Array<{ moveNumber: number; white: string; black: string }>
  >((rows, move, index) => {
    if (index % 2 === 0) {
      rows.push({
        moveNumber: Math.floor(index / 2) + 1,
        white: move,
        black: "",
      });
      return rows;
    }

    rows[rows.length - 1].black = move;
    return rows;
  }, []);

  useEffect(() => {
    return () => {
      if (aiMoveTimeoutRef.current) {
        clearTimeout(aiMoveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!moveHistoryPanelRef.current) {
      return;
    }

      moveHistoryPanelRef.current.scrollTop =
      moveHistoryPanelRef.current.scrollHeight;
  }, [moveHistory]);

  useEffect(() => {
    if (!coachReviewGameKey) {
      return;
    }

    if (shownCoachReviewGameKeyRef.current === coachReviewGameKey) {
      return;
    }

    shownCoachReviewGameKeyRef.current = coachReviewGameKey;
    setCoachReviewModal({ open: true });
  }, [coachReviewGameKey]);

  const setGlobalGameStateAndRef = useCallback((nextState: GlobalGameState) => {
    setGlobalGameState(nextState);
  }, []);

  const clearScheduledAIMove = useCallback(() => {
    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
      aiMoveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;
    let isMounted = true;

    async function loadCurrentGame() {
      const {
        data: { user: authenticatedUser },
      } = await supabaseClient.auth.getUser();

      if (!authenticatedUser?.id || !isMounted) {
        return;
      }

      const { data, error } = await supabaseClient
        .from("current_games")
        .select("fen, move_history, game_mode")
        .eq("user_id", authenticatedUser.id)
        .maybeSingle();

      if (!isMounted || error || !data) {
        return;
      }

      const currentGameRow = data as CurrentGameRow;
      const normalizedMoveHistory = normalizeStoredMoveHistory(
        currentGameRow.move_history
      );
      const restoredGame = new Chess(currentGameRow.fen);
      const restoredGameStatus = checkGameStatus(restoredGame);
      const restoredGameMode =
        currentGameRow.game_mode === "ai" ? "ai" : "pvp";

      lastRequestedSaveStateKeyRef.current = `${currentGameRow.fen}::${normalizedMoveHistory.length}::${restoredGameMode}`;

      clearScheduledAIMove();
      moveHistoryRef.current = normalizedMoveHistory;
      setCurrentGame(restoredGame);
      setFen(currentGameRow.fen);
      setMoveHistory(normalizedMoveHistory);
      setGameMode(restoredGameMode);
      setGlobalGameState({
        gameStatus: restoredGameStatus,
        gameOver: restoredGameStatus !== "active",
      });
    }

    void loadCurrentGame();

    return () => {
      isMounted = false;
    };
  }, [clearScheduledAIMove, setCurrentGame]);

  const openBlunderModal = useCallback((pendingMoveCandidate: PendingMove) => {
    pendingMoveRef.current = pendingMoveCandidate;
    setBlunderModal({
      open: true,
      message: "Blunder detected. Reconsider your move.",
    });
  }, []);

  const closeBlunderModal = useCallback(() => {
    pendingMoveRef.current = null;
    setBlunderModal({
      open: false,
      message: "",
    });
  }, []);

  const openAnalysisFeedback = useCallback((
    detail: AnalysisFeedbackState["detail"],
    nextMovesShown: number
  ) => {
    setAnalysisFeedback({
      open: true,
      detail,
      nextMovesShown,
    });
  }, []);

  const closeAnalysisFeedback = useCallback(() => {
    setAnalysisFeedback({
      open: false,
      detail: "Next alternative",
      nextMovesShown: null,
    });
  }, []);

  const openThinkingSession = useCallback((
    nextPreMoveFen: string,
    nextPostMoveFen: string
  ) => {
    setPreMoveFen(nextPreMoveFen);
    setPostMoveFen(nextPostMoveFen);
    setAnalysisSnapshotFen(nextPreMoveFen);
    setAnalysisFen(nextPreMoveFen);
    setAnalysisPlayerColor(boardOrientation);
    setExpectedMovesCount(null);
    setCurrentMoveIndex(0);
    setMovesShown(0);
    setMovesCountInput("");
    setCurrentStep("count");
    setThinkingSession({
      open: true,
      snapshotFen: nextPreMoveFen,
    });
  }, [boardOrientation]);

  const closeThinkingSession = useCallback(() => {
    setThinkingSession({
      open: false,
      snapshotFen: "",
    });
  }, []);

  const applyGameResultIfNeeded = useCallback((
    status: GameStatus,
    board: Chess
  ) => {
    if (status === "active") {
      return;
    }

    const previousReiatsu = reiatsuStateRef.current;
    const winner: PlayerSide | null =
      status === "checkmate" ? getWinnerForStatus(status, board) : null;

    const finalizedReiatsu = applyGameResultReiatsu(
      previousReiatsu,
      status,
      winner,
      board.history().length
    );

    console.log("[REIATSU DEBUG]", {
      sourceBranch: "game-result-finalize",
      gameResult: status,
      winner,
      playerColor: gameMode === "ai" ? boardOrientation : null,
      oldReiatsu: previousReiatsu.normalized,
      calculatedChange: {
        white:
          finalizedReiatsu.raw.white - previousReiatsu.raw.white,
        black:
          finalizedReiatsu.raw.black - previousReiatsu.raw.black,
      },
      newReiatsu: finalizedReiatsu.normalized,
    });

    reiatsuStateRef.current = finalizedReiatsu;
    setReiatsuState(finalizedReiatsu);
  }, [boardOrientation, gameMode]);

  const updateGameStatus = useCallback((board: Chess): GameStatus => {
    const nextStatus = checkGameStatus(board);
    setGlobalGameStateAndRef({
      gameStatus: nextStatus,
      gameOver: nextStatus !== "active",
    });
    applyGameResultIfNeeded(nextStatus, board);
    return nextStatus;
  }, [applyGameResultIfNeeded, setGlobalGameStateAndRef]);

  const saveCompletedMatch = useCallback(async (
    board: Chess,
    currentMoveHistory: string[],
    currentMode: GameMode,
    result: MatchHistoryResult
  ) => {
    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;
    const matchKey = [
      board.fen(),
      currentMoveHistory.length,
      currentMode,
      result,
    ].join("::");

    if (savedCompletedMatchKeyRef.current === matchKey) {
      return;
    }

    savedCompletedMatchKeyRef.current = matchKey;

    const {
      data: { user: authenticatedUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !authenticatedUser?.id) {
      if (userError) {
        console.error("Supabase match history save failed", userError);
      }
      return;
    }

    const playerColor = currentMode === "ai" ? boardOrientation : null;
    const savedReiatsuChange =
      playerColor === "white"
        ? reiatsuStateRef.current.raw.white
        : playerColor === "black"
          ? reiatsuStateRef.current.raw.black
          : null;
    const winner = getWinnerForStatus(result, board);
    const opponentType = currentMode === "ai" ? "ai" : "local";
    const existingProfile = await getProfile(authenticatedUser.id, supabase);
    const reiatsuBefore = existingProfile?.reiatsu ?? 0;
    const reiatsuAfter = Math.max(0, reiatsuBefore + (savedReiatsuChange ?? 0));
    const reiatsuDelta = reiatsuAfter - reiatsuBefore;
    let persistedCoachSummary = serializeCoachSummary(coachSummary);

    if (!persistedCoachSummary) {
      try {
        persistedCoachSummary = serializeCoachSummary(
          buildCoachSummary(
            reiatsuStateRef.current.history,
            result,
            boardOrientation,
            winner,
            currentMoveHistory
          )
        );
      } catch (coachSummaryError) {
        console.error("Coach summary serialization failed", coachSummaryError);
        persistedCoachSummary = null;
      }
    }

    console.log("[REIATSU DEBUG]", {
      sourceBranch: "match-history-save",
      gameResult: result,
      winner,
      playerColor,
      oldReiatsu: null,
      calculatedChange: null,
      newReiatsu: reiatsuStateRef.current.normalized,
      savedReiatsuChange,
    });

    const payload: MatchHistoryPayload = {
      user_id: authenticatedUser.id,
      opponent_type: opponentType,
      reiatsu_before: reiatsuBefore,
      reiatsu_after: reiatsuAfter,
      reiatsu_delta: reiatsuDelta,
      final_fen: board.fen(),
      move_history: currentMoveHistory,
      game_mode: currentMode,
      result,
      winner,
      player_color: playerColor,
      ai_difficulty: null,
      reiatsu_change: savedReiatsuChange,
      coach_summary: persistedCoachSummary,
    };

    const { error } = await supabaseClient
      .from("match_history")
      .insert(payload)
      .select();

    if (error) {
      console.error("Supabase match history save failed", error);
      savedCompletedMatchKeyRef.current = null;
      return;
    }

    const profileStatsUpdate = await updateProfileStats({
      userId: authenticatedUser.id,
      reiatsuChange: savedReiatsuChange ?? 0,
      result,
      winner,
      playerColor,
      client: supabase,
    });

    if (!profileStatsUpdate) {
      console.error("Supabase profile stats save failed", {
        result,
        winner,
        playerColor,
        savedReiatsuChange,
      });
      return;
    }

    onTotalReiatsuChange?.(profileStatsUpdate.reiatsuAfter);
    onProfileUpdated?.();

    onMatchSaved?.();
  }, [
    boardOrientation,
    coachSummary,
    onMatchSaved,
    onProfileUpdated,
    onTotalReiatsuChange,
  ]);

  const saveCurrentGame = useCallback(async (
    source: "player-move" | "ai-move" | "reset",
    currentFen: string,
    currentMoveHistory: string[],
    currentMode: GameMode
  ) => {
    if (typeof currentMode !== "string") {
      console.error("Invalid current game mode for save", {
        source,
        currentMode,
        fen: currentFen,
        moveHistoryLength: currentMoveHistory.length,
      });
      return;
    }

    const stateKey = `${currentFen}::${currentMoveHistory.length}::${currentMode}`;

    if (lastRequestedSaveStateKeyRef.current === stateKey) {
      console.warn("Skipping duplicate current game save", {
        source,
        stateKey,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    lastRequestedSaveStateKeyRef.current = stateKey;
    const requestId = latestSaveRequestIdRef.current + 1;
    latestSaveRequestIdRef.current = requestId;

    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (requestId !== latestSaveRequestIdRef.current) {
          console.warn("Skipping stale current game save before request", {
            source,
            stateKey,
            requestId,
            latestRequestId: latestSaveRequestIdRef.current,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const {
          data: { user: authenticatedUser },
          error: userError,
        } = await supabaseClient.auth.getUser();

        if (requestId !== latestSaveRequestIdRef.current) {
          console.warn("Ignoring stale current game save after auth", {
            source,
            stateKey,
            requestId,
            latestRequestId: latestSaveRequestIdRef.current,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (!authenticatedUser?.id) {
          return;
        }

        const payload = {
          user_id: authenticatedUser.id,
          fen: currentFen,
          move_history: currentMoveHistory,
          game_mode: currentMode,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabaseClient
          .from("current_games")
          .upsert(payload, { onConflict: "user_id" })
          .select();

        if (requestId !== latestSaveRequestIdRef.current) {
          console.warn("Ignoring stale current game save after response", {
            source,
            stateKey,
            requestId,
            latestRequestId: latestSaveRequestIdRef.current,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (userError || error) {
          console.error("Supabase current game save failed", {
            source,
            stateKey,
            fen: currentFen,
            moveHistoryLength: currentMoveHistory.length,
            turn: new Chess(currentFen).turn(),
            payload,
            data,
            error: error ?? userError,
          });
        }
      });

    await saveQueueRef.current;
  }, []);

  const onMovePlayed = useCallback((
    board: Chess,
    move: { color: "w" | "b"; san?: string },
    evalBeforeMove: number,
    playerEvalAfterMove: number
  ) => {
    const previousReiatsu = reiatsuStateRef.current;
    const moveInput = {
      moveNumber: board.history().length,
      san: move.san,
      player: move.color === "w" ? "white" : "black",
    } as const;
    const evalInput = {
      before: evalBeforeMove,
      after: playerEvalAfterMove,
    } as const;
    const impactPreview = calculateMoveImpact(moveInput, evalInput);

    const nextState = updateReiatsu(
      previousReiatsu,
      moveInput,
      evalInput
    );

    console.log("[REIATSU DEBUG]", {
      sourceBranch: "move-update",
      gameResult: "ongoing",
      winner: null,
      playerColor: gameMode === "ai" ? boardOrientation : null,
      moverColor: moveInput.player,
      moveSan: moveInput.san,
      moveTag: impactPreview.qualityTag,
      evalBefore: evalInput.before,
      evalAfter: evalInput.after,
      evalDeltaFromMoverView: impactPreview.positionDelta,
      impactScore: impactPreview.totalDelta,
      rawBefore: previousReiatsu.raw,
      rawAfter: nextState.raw,
      oldReiatsu: previousReiatsu.normalized,
      calculatedChange: {
        white: nextState.raw.white - previousReiatsu.raw.white,
        black: nextState.raw.black - previousReiatsu.raw.black,
      },
      newReiatsu: nextState.normalized,
    });

    reiatsuStateRef.current = nextState;
    setReiatsuState(nextState);
  }, [boardOrientation, gameMode]);

  const makeAIMove = useCallback((currentFen: string) => {
    const aiGame = new Chess(currentFen);
    if (aiGame.isGameOver()) {
      updateGameStatus(aiGame);
      return;
    }

    const legalMoves = aiGame.moves({ verbose: true });
    if (legalMoves.length === 0) {
      updateGameStatus(aiGame);
      return;
    }

    const selectedMove = pickRandomMove(legalMoves);
    const evalBeforeMove = evaluateMaterial(currentFen);
    const playedMove = aiGame.move({
      from: selectedMove.from,
      to: selectedMove.to,
      promotion: selectedMove.promotion,
    });

    if (!playedMove) {
      return;
    }

    const nextFen = aiGame.fen();
    const playerEvalAfterMove = evaluateMaterial(nextFen);

    setCurrentGame(aiGame);
    setFen(nextFen);
    onMovePlayed(aiGame, playedMove, evalBeforeMove, playerEvalAfterMove);
    updateGameStatus(aiGame);
    const nextMoveHistory = [...moveHistoryRef.current, playedMove.san];
    moveHistoryRef.current = nextMoveHistory;
    setMoveHistory(nextMoveHistory);
    const nextStatus = checkGameStatus(aiGame);

    if (nextStatus !== "active") {
      void saveCompletedMatch(aiGame, nextMoveHistory, gameMode, nextStatus);
    }

    void saveCurrentGame("ai-move", nextFen, nextMoveHistory, gameMode);
  }, [
    gameMode,
    onMovePlayed,
    saveCompletedMatch,
    saveCurrentGame,
    setCurrentGame,
    updateGameStatus,
  ]);

  const scheduleAIMove = useCallback((currentFen: string) => {
    clearScheduledAIMove();
    aiMoveTimeoutRef.current = setTimeout(() => {
      aiMoveTimeoutRef.current = null;
      makeAIMove(currentFen);
    }, 400);
  }, [clearScheduledAIMove, makeAIMove]);

  useEffect(() => {
    const shouldTriggerInitialAIMove =
      gameMode === "ai" &&
      boardOrientation === "black" &&
      fen === INITIAL_FEN &&
      moveHistory.length === 0 &&
      !gameOver &&
      new Chess(fen).turn() === "w" &&
      aiMoveTimeoutRef.current === null;

    if (!shouldTriggerInitialAIMove) {
      initialAIMoveTriggeredRef.current = false;
      return;
    }

    if (initialAIMoveTriggeredRef.current) {
      return;
    }

    initialAIMoveTriggeredRef.current = true;
    scheduleAIMove(fen);
  }, [
    boardOrientation,
    fen,
    gameMode,
    gameOver,
    moveHistory.length,
    scheduleAIMove,
  ]);

  const handleMoveByGameMode = useCallback((
    nextStatus: GameStatus,
    nextFen: string
  ) => {
    if (nextStatus !== "active") {
      return;
    }

    switch (gameMode) {
      case "pvp":
        clearScheduledAIMove();
        return;
      case "ai":
        scheduleAIMove(nextFen);
        return;
    }
  }, [clearScheduledAIMove, gameMode, scheduleAIMove]);

  const getMoveDiff = useCallback((
    currentFen: string,
    move: {
      from: string;
      to: string;
      promotion?: string;
    }
  ): number | null => {
    const { bestEval } = compareMoveToBest(currentFen, move);
    const nextGame = new Chess(currentFen);
    const simulatedMove = nextGame.move(move);

    if (!simulatedMove) {
      return null;
    }

    const playerEval = evaluateMaterial(nextGame.fen());
    return Math.abs(bestEval - playerEval);
  }, []);

  const commitPlayerMove = useCallback((
    fenBeforeMove: string,
    selectedOption: {
      from: string;
      to: string;
      promotion?: string;
    }
  ): boolean => {
    const evalBeforeMove = evaluateMaterial(fenBeforeMove);
    const { bestEval } = compareMoveToBest(fenBeforeMove, {
      from: selectedOption.from,
      to: selectedOption.to,
      promotion: selectedOption.promotion,
    });
    const nextGame = new Chess(fenBeforeMove);
    let move = null;
    try {
      move = nextGame.move({
        from: selectedOption.from,
        to: selectedOption.to,
        promotion: selectedOption.promotion,
      });
    } catch {
      return false;
    }

    if (!move) {
      return false;
    }

    const nextFen = nextGame.fen();
    const playerEval = evaluateMaterial(nextFen);
    const diff =
      move.color === "w" ? bestEval - playerEval : playerEval - bestEval;

    setCurrentGame(nextGame);
    setFen(nextFen);
    setMoveQuality(classifyMove(diff));
    onMovePlayed(nextGame, move, evalBeforeMove, playerEval);
    const nextStatus = updateGameStatus(nextGame);
    const nextMoveHistory = [...moveHistoryRef.current, move.san];
    moveHistoryRef.current = nextMoveHistory;
    setMoveHistory(nextMoveHistory);
    const shouldSaveAfterPlayerMove =
      gameMode === "pvp" || nextStatus !== "active";

    if (shouldSaveAfterPlayerMove) {
      void saveCurrentGame("player-move", nextFen, nextMoveHistory, gameMode);
    }

    if (nextStatus !== "active") {
      void saveCompletedMatch(nextGame, nextMoveHistory, gameMode, nextStatus);
    }

    if (gameMode === "ai") {
      const nextMoveCount = moveCount + 1;
      setMoveCount(nextMoveCount);

      if (nextStatus === "active" && nextMoveCount === nextTriggerMove) {
        openThinkingSession(fenBeforeMove, nextFen);
        setNextTriggerMove(getNextTriggerMove(nextMoveCount));
      } else {
        handleMoveByGameMode(nextStatus, nextFen);
      }
    } else {
      handleMoveByGameMode(nextStatus, nextFen);
    }

    setPendingPromotionMove(null);
    return true;
  }, [
    gameMode,
    handleMoveByGameMode,
    moveCount,
    nextTriggerMove,
    onMovePlayed,
    openThinkingSession,
    saveCompletedMatch,
    saveCurrentGame,
    setCurrentGame,
    updateGameStatus,
  ]);

  const applyPlayerMove = useCallback((
    sourceSquare: string,
    targetSquare: string,
    promotion?: PromotionPiece
  ): boolean => {
    if (gameOver) {
      return false;
    }
    const currentGame = gameRef.current;
    if (checkGameStatus(currentGame) !== "active") {
      updateGameStatus(currentGame);
      return false;
    }

    const legalOptions = generateLegalMovesFromPosition(currentGame).filter(
      (move) => move.from === sourceSquare && move.to === targetSquare
    );
    if (legalOptions.length === 0) {
      return false;
    }

    const hasPromotionOptions = legalOptions.some((move) => Boolean(move.promotion));
    if (hasPromotionOptions && !promotion) {
      setPendingPromotionMove({ from: sourceSquare, to: targetSquare });
      setSelectedPromotionPiece(null);
      return true;
    }

    const selectedOption = promotion
      ? legalOptions.find((move) => move.promotion === promotion)
      : legalOptions.find((move) => !move.promotion);

    if (!selectedOption) {
      return false;
    }

    const fenBeforeMove = fen;
    const diff = getMoveDiff(fenBeforeMove, selectedOption);
    if (diff === null) {
      return false;
    }

    if (isBlunder(diff)) {
      openBlunderModal({
        from: selectedOption.from,
        to: selectedOption.to,
        fenBefore: fenBeforeMove,
        promotion: selectedOption.promotion,
      });
      return false;
    }

    return commitPlayerMove(fenBeforeMove, selectedOption);
  }, [
    commitPlayerMove,
    fen,
    gameOver,
    getMoveDiff,
    openBlunderModal,
    updateGameStatus,
  ]);

  const canPlayerMove = useCallback((sourceSquare: string): boolean => {
    if (
      isBlunderModalOpen ||
      isThinkingSessionOpen ||
      isAnalysisFeedbackOpen ||
      analysisSnapshotFen
    ) {
      return false;
    }
    if (gameOver) return false;
    const currentGame = gameRef.current;
    if (currentGame.isGameOver()) return false;

    const sourcePiece = currentGame.get(sourceSquare as Square);
    if (!sourcePiece || sourcePiece.color !== currentGame.turn()) {
      return false;
    }

    switch (gameMode) {
      case "pvp":
        return true;
      case "ai":
        return sourcePiece.color === boardOrientation[0];
    }
  }, [
    analysisSnapshotFen,
    boardOrientation,
    gameMode,
    gameOver,
    isAnalysisFeedbackOpen,
    isBlunderModalOpen,
    isThinkingSessionOpen,
  ]);

  const onPieceDrop = useCallback(({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (
      isBlunderModalOpen ||
      isThinkingSessionOpen ||
      isAnalysisFeedbackOpen ||
      analysisSnapshotFen
    ) {
      return false;
    }
    if (!targetSquare) return false;
    if (!canPlayerMove(sourceSquare)) return false;

    return applyPlayerMove(sourceSquare, targetSquare);
  }, [
    analysisSnapshotFen,
    applyPlayerMove,
    canPlayerMove,
    isAnalysisFeedbackOpen,
    isBlunderModalOpen,
    isThinkingSessionOpen,
  ]);

  const onAnalysisPieceDrop = useCallback(({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (isAnalysisFeedbackOpen || currentStep !== "showMoves") {
      return false;
    }

    const baseAnalysisFen = analysisSnapshotFen;
    if (!baseAnalysisFen || !targetSquare || !analysisPlayerColor) {
      return false;
    }

    const analysisGame = new Chess(baseAnalysisFen);
    const playerColorCode = analysisPlayerColor[0];
    if (analysisGame.turn() !== playerColorCode) {
      return false;
    }

    const sourcePiece = analysisGame.get(sourceSquare as Square);
    if (!sourcePiece || sourcePiece.color !== playerColorCode) {
      return false;
    }

    const legalMoves = generateLegalMovesFromPosition(analysisGame).filter(
      (move) => move.from === sourceSquare && move.to === targetSquare
    );

    if (legalMoves.length === 0) {
      return false;
    }

    const selectedMove =
      legalMoves.find((move) => !move.promotion) ?? {
        ...legalMoves[0],
        promotion: legalMoves[0].promotion ?? "q",
      };

    const playedMove = analysisGame.move({
      from: selectedMove.from,
      to: selectedMove.to,
      promotion: selectedMove.promotion,
    });

    if (!playedMove) {
      return false;
    }

    const nextMovesShown = movesShown + 1;
    const isLastMove =
      expectedMovesCount !== null && nextMovesShown >= expectedMovesCount;
    setAnalysisFen(analysisGame.fen());
    openAnalysisFeedback(
      isLastMove ? "Last move" : "Next alternative",
      nextMovesShown
    );

    return true;
  }, [
    analysisPlayerColor,
    analysisSnapshotFen,
    currentStep,
    expectedMovesCount,
    isAnalysisFeedbackOpen,
    movesShown,
    openAnalysisFeedback,
  ]);

  const resetGameWithMode = useCallback((nextMode: GameMode) => {
    const nextGame = new Chess();
    clearScheduledAIMove();
    savedCompletedMatchKeyRef.current = null;
    shownCoachReviewGameKeyRef.current = null;
    moveHistoryRef.current = [];
    setMoveHistory([]);
    setCurrentGame(nextGame);
    setFen(nextGame.fen());
    setGameMode(nextMode);
    setMoveCount(0);
    setNextTriggerMove(getNextTriggerMove(0));
    setPreMoveFen(null);
    setPostMoveFen(null);
    setAnalysisSnapshotFen(null);
    setAnalysisFen(null);
    setAnalysisPlayerColor(null);
    setExpectedMovesCount(null);
    setCurrentMoveIndex(0);
    setMovesShown(0);
    setMovesCountInput("");
    setCurrentStep("done");
    reiatsuStateRef.current = createInitialReiatsuState();
    setReiatsuState(reiatsuStateRef.current);
    closeBlunderModal();
    closeAnalysisFeedback();
    closeThinkingSession();
    setCoachReviewModal({ open: false });
    setMoveQuality(null);
    setPendingPromotionMove(null);
    setSelectedPromotionPiece(null);
    setGlobalGameStateAndRef({ gameStatus: "active", gameOver: false });
    void saveCurrentGame("reset", nextGame.fen(), [], nextMode);
  }, [
    clearScheduledAIMove,
    closeAnalysisFeedback,
    closeBlunderModal,
    closeThinkingSession,
    saveCurrentGame,
    setCurrentGame,
    setGlobalGameStateAndRef,
  ]);

  const resetGame = useCallback(() => {
    resetGameWithMode(gameMode);
  }, [gameMode, resetGameWithMode]);

  const handleGameModeChange = useCallback((nextMode: GameMode) => {
    resetGameWithMode(nextMode);
  }, [resetGameWithMode]);

  const handleBoardOrientationChange = useCallback((
    nextOrientation: BoardOrientation
  ) => {
    if (nextOrientation === boardOrientation) {
      return;
    }

    setBoardOrientation(nextOrientation);

    if (gameMode === "ai") {
      resetGameWithMode(gameMode);
    }
  }, [boardOrientation, gameMode, resetGameWithMode]);

  const handleTryAgain = useCallback(() => {
    closeBlunderModal();
  }, [closeBlunderModal]);

  const handlePlayAnyway = useCallback(() => {
    const overrideMove = pendingMoveRef.current;
    if (!overrideMove) {
      closeBlunderModal();
      return;
    }

    closeBlunderModal();
    void commitPlayerMove(overrideMove.fenBefore, {
      from: overrideMove.from,
      to: overrideMove.to,
      promotion: overrideMove.promotion,
    });
  }, [closeBlunderModal, commitPlayerMove]);

  const handleGoToAnalysis = useCallback(() => {
    closeThinkingSession();

    requestAnimationFrame(() => {
      analysisSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [closeThinkingSession]);

  const handleContinueAnalysis = useCallback(() => {
    const nextMovesShown = analysisNextMovesShown;
    const isLastMove =
      nextMovesShown !== null &&
      expectedMovesCount !== null &&
      nextMovesShown >= expectedMovesCount;

    if (nextMovesShown !== null) {
      setMovesShown(nextMovesShown);
      setCurrentMoveIndex(nextMovesShown);
    }

    setAnalysisFen(analysisSnapshotFen);
    closeAnalysisFeedback();

    if (isLastMove) {
      setCurrentStep("done");
    }
  }, [
    analysisNextMovesShown,
    analysisSnapshotFen,
    closeAnalysisFeedback,
    expectedMovesCount,
  ]);

  const handleReturnToGame = useCallback(() => {
    const nextPostMoveFen = postMoveFen;
    setPreMoveFen(null);
    setPostMoveFen(null);
    setAnalysisSnapshotFen(null);
    setAnalysisFen(null);
    setAnalysisPlayerColor(null);
    setExpectedMovesCount(null);
    setCurrentMoveIndex(0);
    setMovesShown(0);
    setMovesCountInput("");
    setCurrentStep("done");
    closeThinkingSession();

    if (nextPostMoveFen) {
      scheduleAIMove(nextPostMoveFen);
    }
  }, [closeThinkingSession, postMoveFen, scheduleAIMove]);

  const handleMovesCountSubmit = useCallback(() => {
    const parsedValue = Number.parseInt(movesCountInput, 10);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return;
    }

    setExpectedMovesCount(parsedValue);
    setCurrentMoveIndex(0);
    setMovesShown(0);
    setAnalysisFen(analysisSnapshotFen);
    setCurrentStep("showMoves");
  }, [analysisSnapshotFen, movesCountInput]);

  const handleCloseCoachReviewModal = useCallback(() => {
    setCoachReviewModal({ open: false });
  }, []);

  const handleViewCoachReview = useCallback(() => {
    setCoachReviewModal({ open: false });
    const coachSection = coachSummarySectionRef.current;
    if (!coachSection) {
      return;
    }

    try {
      coachSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      coachSection.focus();
    } catch (error) {
      console.error("Coach review scroll failed", error);
    }
  }, []);

  return (
    <div className="w-full max-w-[520px] overflow-x-hidden">
      <GameStatusBanner gameStatus={gameStatus} />
      {coachReviewModal.open && gameOver && coachSummary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl dark:bg-zinc-900">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              AI Coach Review Ready
            </p>
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
              Review your best move and biggest mistake from this game.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseCoachReviewModal}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleViewCoachReview}
                className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white sm:w-auto dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Review Game
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <p className="mb-3 text-base text-zinc-600 dark:text-zinc-300">
        Total Reiatsu: {totalReiatsu}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Eval: {evaluationScore.toFixed(2)}
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Moves: {moveHistory.length}
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Player Moves: {moveCount}
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Status: {gameStatus}
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Move: {moveQuality ?? "-"}
        </p>
        <label className="col-span-2 flex items-center gap-2 text-base text-zinc-700 sm:col-span-1 dark:text-zinc-200">
          Side
          <select
            value={boardOrientation}
            onChange={(event) =>
              handleBoardOrientationChange(
                event.target.value as BoardOrientation
              )
            }
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => handleGameModeChange("pvp")}
          className={getModeButtonClassName(gameMode === "pvp")}
        >
          Play vs Player
        </button>
        <button
          type="button"
          onClick={() => handleGameModeChange("ai")}
          className={getModeButtonClassName(gameMode === "ai")}
        >
          Play vs AI
        </button>
      </div>
      <div className="m-0 flex items-center justify-center overflow-hidden p-0">
        <Chessboard
          options={{
            boardOrientation,
            position: boardPosition,
            onPieceDrop,
            boardStyle: CHESSBOARD_BOARD_STYLE,
            squareStyle: CHESSBOARD_SQUARE_STYLE,
            lightSquareStyle: CHESSBOARD_LIGHT_SQUARE_STYLE,
            darkSquareStyle: CHESSBOARD_DARK_SQUARE_STYLE,
            dropSquareStyle: CHESSBOARD_DROP_SQUARE_STYLE,
          }}
        />
      </div>
      {blunderModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl dark:bg-zinc-900">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {blunderModal.message}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleTryAgain}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handlePlayAnyway}
                className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white sm:w-auto dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Play anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {thinkingSession.open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-md bg-white p-6 shadow-xl dark:bg-zinc-900">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Pause. Analyze the position below.
            </p>
            <div className="mt-4 flex">
              <button
                type="button"
                onClick={handleGoToAnalysis}
                className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Go to analysis
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {analysisFeedback.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl dark:bg-zinc-900">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Move registered
            </p>
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
              {analysisFeedback.detail}
            </p>
            <div className="mt-4 flex">
              <button
                type="button"
                onClick={handleContinueAnalysis}
                className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {analysisSnapshotFen && currentStep === "done" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-xl dark:bg-zinc-900">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Responses recorded. You can continue the game.
            </p>
            <div className="mt-4 flex">
              <button
                type="button"
                onClick={handleReturnToGame}
                className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Return to game
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingPromotionMove ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-base text-zinc-700 dark:text-zinc-200">
            Choose promotion:
          </span>
          {(["q", "r", "b", "n"] as PromotionPiece[]).map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => {
                setSelectedPromotionPiece(piece);
                applyPlayerMove(
                  pendingPromotionMove.from,
                  pendingPromotionMove.to,
                  piece
                );
              }}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-base font-medium uppercase text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {piece}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPendingPromotionMove(null)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-base text-zinc-700 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          {selectedPromotionPiece ? (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Last selected: {selectedPromotionPiece.toUpperCase()}
            </span>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={resetGame}
        className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        Reset Game
      </button>
      <section className="mt-6 rounded-md border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Move History
        </h2>
        {moveRows.length === 0 ? (
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-300">
            No moves yet.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <span>#</span>
              <span>White</span>
              <span>Black</span>
            </div>
            <div
              ref={moveHistoryPanelRef}
              className="max-h-64 overflow-y-auto"
            >
              {moveRows.map((row, index) => (
                <div
                  key={row.moveNumber}
                  className={`grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] px-3 py-2 text-base text-zinc-800 dark:text-zinc-100 ${
                    index < moveRows.length - 1
                      ? "border-b border-zinc-200 dark:border-zinc-800"
                      : ""
                  }`}
                >
                  <span className="font-medium text-zinc-500 dark:text-zinc-400">
                    {row.moveNumber}.
                  </span>
                  <span
                    className={`pr-2 ${
                      index * 2 === moveHistory.length - 1
                        ? "rounded-sm bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40"
                        : ""
                    }`}
                  >
                    {row.white}
                  </span>
                  <span
                    className={
                      index * 2 + 1 === moveHistory.length - 1
                        ? "rounded-sm bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40"
                        : ""
                    }
                  >
                    {row.black}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      {gameOver && coachSummary?.bestMove && coachSummary?.biggestMistake ? (
        <section
          ref={coachSummarySectionRef}
          tabIndex={-1}
          className="mt-6 rounded-md border border-zinc-300 bg-white px-4 py-4 outline-none dark:border-zinc-700 dark:bg-zinc-900"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            AI Coach
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {coachSummary.overallAssessment}
          </p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Best Move
              </p>
              <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                {coachSummary.bestMove?.san ?? "No standout move recorded."}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Move {coachSummary.bestMove.moveNumber} · {coachSummary.bestMove.label}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {coachSummary.bestMove?.explanation ?? "No explanation available."}
              </p>
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Biggest Mistake
              </p>
              <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                {coachSummary.biggestMistake?.san ?? "No major mistake recorded."}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Move {coachSummary.biggestMistake.moveNumber} · {coachSummary.biggestMistake.label}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Played move: {coachSummary.biggestMistake?.san ?? "not available"}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Better move: {coachSummary.biggestMistake?.betterMoveSan ?? "not available"}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {coachSummary.biggestMistake?.explanation ?? "No explanation available."}
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {analysisSnapshotFen ? (
        <section
          ref={analysisSectionRef}
          className="mt-10 rounded-md border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Analysis Board
          </h2>
          {currentStep === "count" ? (
            <div className="mt-3">
              <label className="block text-base text-zinc-700 dark:text-zinc-200">
                How many moves did you consider?
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  min="1"
                  value={movesCountInput}
                  onChange={(event) => setMovesCountInput(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:w-32 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleMovesCountSubmit}
                  className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-base font-medium text-white sm:w-auto dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Submit
                </button>
              </div>
            </div>
          ) : null}
          {currentStep === "showMoves" && analysisBoardPosition ? (
            <>
              <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
                You considered {expectedMovesCount} move
                {expectedMovesCount === 1 ? "" : "s"}. Explore alternatives below.
              </p>
              <p className="mt-2 text-base font-medium text-zinc-800 dark:text-zinc-200">
                Next move
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Candidate {currentMoveIndex + 1} of {expectedMovesCount}
              </p>
              <p className="mt-3 break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {analysisSnapshotFen}
              </p>
              <div className="mt-4 m-0 flex items-center justify-center overflow-hidden p-0">
                <Chessboard
                  options={{
                    boardOrientation: analysisPlayerColor ?? boardOrientation,
                    position: analysisBoardPosition,
                    onPieceDrop: onAnalysisPieceDrop,
                    boardStyle: CHESSBOARD_BOARD_STYLE,
                    squareStyle: CHESSBOARD_SQUARE_STYLE,
                    lightSquareStyle: CHESSBOARD_LIGHT_SQUARE_STYLE,
                    darkSquareStyle: CHESSBOARD_DARK_SQUARE_STYLE,
                    dropSquareStyle: CHESSBOARD_DROP_SQUARE_STYLE,
                  }}
                />
              </div>
            </>
          ) : null}
          {currentStep === "done" ? (
            <>
              <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
                You showed {movesShown} move{movesShown === 1 ? "" : "s"} from
                this position.
              </p>
              <p className="mt-2 text-base font-medium text-zinc-800 dark:text-zinc-200">
                Analysis complete
              </p>
              <p className="mt-3 break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {analysisSnapshotFen}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

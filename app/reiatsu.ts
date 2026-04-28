export type PlayerSide = "white" | "black";
export type GameResult = "white_win" | "black_win" | "draw" | "ongoing";

export type MoveQualityTag =
  | "blunder"
  | "mistake"
  | "inaccuracy"
  | "good"
  | "best"
  | "forced_tactic_win"
  | "neutral";

export type PositionEval = {
  before: number;
  after: number;
};

export type ReiatsuMoveInput = {
  moveNumber: number;
  san?: string;
  player: PlayerSide;
  gameResult?: GameResult;
  qualityTag?: MoveQualityTag;
  forcedTacticWin?: boolean;
};

export interface MoveReiatsuEvent {
  moveNumber: number;
  player: PlayerSide;
  san?: string;
  qualityTag: MoveQualityTag;
  evalBefore: number;
  evalAfter: number;
  positionDelta: number;
  resultPressureDelta: number;
  mistakeImpactDelta: number;
  positiveImpactDelta: number;
  totalDelta: number;
  rawAfter: {
    white: number;
    black: number;
  };
  normalizedAfter: {
    white: number;
    black: number;
  };
}

export interface ReiatsuGameEndEvent {
  type: "game_end";
  moveNumber: number;
  result: "checkmate" | "stalemate" | "draw";
  winner: PlayerSide | null;
  finalScoreAdjustment: {
    white: number;
    black: number;
  };
  rawFinal: {
    white: number;
    black: number;
  };
  normalizedFinal: {
    white: number;
    black: number;
  };
}

export type ReiatsuHistoryEvent = MoveReiatsuEvent | ReiatsuGameEndEvent;

export interface GameStateReiatsu {
  raw: {
    white: number;
    black: number;
  };
  normalized: {
    white: number;
    black: number;
  };
  finalSnapshot: {
    finalWhiteReiatsu: number;
    finalBlackReiatsu: number;
  } | null;
  isLocked: boolean;
  gameResultApplied: boolean;
  history: ReiatsuHistoryEvent[];
}

export interface ReiatsuSummaryStatistics {
  totalMistakes: number;
  totalBlunders: number;
  totalGoodMoves: number;
  totalBestMoves: number;
  finalReiatsuScore: {
    white: number;
    black: number;
  };
}

export interface ReiatsuGameExport {
  moves: Array<{
    moveNumber: number;
    san?: string;
    player: PlayerSide;
    classification: MoveQualityTag;
    evalBefore: number;
    evalAfter: number;
  }>;
  reiatsuTimeline: ReiatsuHistoryEvent[];
  summary: ReiatsuSummaryStatistics;
}

export const DEBUG_REIATSU =
  process.env.NEXT_PUBLIC_DEBUG_REIATSU === "true";

const RESULT_PRESSURE_VALUES: Record<Exclude<GameResult, "ongoing">, number> = {
  white_win: 100,
  black_win: -100,
  draw: 0,
};
const MAX_MOVE_QUALITY_REIATSU_PER_SIDE = 110;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeReiatsu(raw: number): number {
  // Smooth normalization to [-100, 100] that preserves sign and avoids hard clipping.
  const normalized = (100 * raw) / (100 + Math.abs(raw));
  return clamp(normalized, -100, 100);
}

function capMoveQualityReiatsu(raw: number): number {
  return Math.min(raw, MAX_MOVE_QUALITY_REIATSU_PER_SIDE);
}

function scoreByTag(tag: MoveQualityTag): number {
  switch (tag) {
    case "blunder":
      return -25;
    case "mistake":
      return -10;
    case "inaccuracy":
      return -3;
    case "good":
      return 3;
    case "best":
      return 8;
    case "forced_tactic_win":
      return 10;
    default:
      return 0;
  }
}

function classifyFromEvalDelta(positionDelta: number): MoveQualityTag {
  // Positive delta means the mover improved their position.
  if (positionDelta <= -9) return "blunder";
  if (positionDelta <= -5) return "mistake";
  if (positionDelta <= -3) return "inaccuracy";
  if (positionDelta >= 9) return "forced_tactic_win";
  if (positionDelta >= 5) return "best";
  if (positionDelta >= 3) return "good";
  return "neutral";
}

function getResultPressureForSide(
  player: PlayerSide,
  result: GameResult | undefined
): number {
  if (!result || result === "ongoing") return 0;
  if (result === "draw") return 0;
  const whiteSigned = RESULT_PRESSURE_VALUES[result];
  return player === "white" ? whiteSigned : -whiteSigned;
}

function splitImpactByTag(tag: MoveQualityTag): {
  mistakeImpactDelta: number;
  positiveImpactDelta: number;
} {
  const tagScore = scoreByTag(tag);
  if (tagScore < 0) {
    return {
      mistakeImpactDelta: tagScore,
      positiveImpactDelta: 0,
    };
  }
  if (tagScore > 0) {
    return {
      mistakeImpactDelta: 0,
      positiveImpactDelta: tagScore,
    };
  }
  return {
    mistakeImpactDelta: 0,
    positiveImpactDelta: 0,
  };
}

export function createInitialReiatsuState(): GameStateReiatsu {
  return {
    raw: { white: 0, black: 0 },
    normalized: { white: 0, black: 0 },
    finalSnapshot: null,
    isLocked: false,
    gameResultApplied: false,
    history: [],
  };
}

export function calculateMoveImpact(
  move: ReiatsuMoveInput,
  positionEval: PositionEval
): Omit<
  MoveReiatsuEvent,
  "rawAfter" | "normalizedAfter"
> {
  const moverSign = move.player === "white" ? 1 : -1;
  const evalDeltaFromMoverView = (positionEval.after - positionEval.before) * moverSign;
  const qualityTag =
    move.forcedTacticWin
      ? "forced_tactic_win"
      : move.qualityTag ?? classifyFromEvalDelta(evalDeltaFromMoverView);

  const resultPressureDelta = getResultPressureForSide(move.player, move.gameResult);
  const { mistakeImpactDelta, positiveImpactDelta } = splitImpactByTag(qualityTag);

  const totalDelta =
    resultPressureDelta + mistakeImpactDelta + positiveImpactDelta;

  return {
    moveNumber: move.moveNumber,
    player: move.player,
    san: move.san,
    qualityTag,
    evalBefore: positionEval.before,
    evalAfter: positionEval.after,
    positionDelta: evalDeltaFromMoverView,
    resultPressureDelta,
    mistakeImpactDelta,
    positiveImpactDelta,
    totalDelta,
  };
}

export function updateReiatsu(
  state: GameStateReiatsu,
  move: ReiatsuMoveInput,
  positionEval: PositionEval
): GameStateReiatsu {
  if (state.isLocked) {
    return state;
  }

  const impact = calculateMoveImpact(move, positionEval);
  const nextRaw = {
    white: state.raw.white,
    black: state.raw.black,
  };

  if (move.player === "white") {
    nextRaw.white += impact.totalDelta;
    nextRaw.white = capMoveQualityReiatsu(nextRaw.white);
  } else {
    nextRaw.black += impact.totalDelta;
    nextRaw.black = capMoveQualityReiatsu(nextRaw.black);
  }

  const nextNormalized = {
    white: normalizeReiatsu(nextRaw.white),
    black: normalizeReiatsu(nextRaw.black),
  };

  const event: MoveReiatsuEvent = {
    ...impact,
    rawAfter: nextRaw,
    normalizedAfter: nextNormalized,
  };

  if (DEBUG_REIATSU) {
    // Structured debug payload for move-by-move diagnostics.
    console.log("[REIATSU]", {
      moveNumber: event.moveNumber,
      san: event.san,
      player: event.player,
      classification: event.qualityTag,
      evalBefore: event.evalBefore,
      evalAfter: event.evalAfter,
      delta: event.totalDelta,
      components: {
        resultPressure: event.resultPressureDelta,
        mistakeImpact: event.mistakeImpactDelta,
        positiveImpact: event.positiveImpactDelta,
      },
      cumulative: event.normalizedAfter,
    });
  }

  return {
    raw: nextRaw,
    normalized: nextNormalized,
    finalSnapshot: state.finalSnapshot,
    isLocked: state.isLocked,
    gameResultApplied: state.gameResultApplied,
    history: [...state.history, event],
  };
}

export function applyGameResultReiatsu(
  state: GameStateReiatsu,
  result: "checkmate" | "stalemate" | "draw",
  winner: PlayerSide | null,
  moveNumber: number
): GameStateReiatsu {
  if (state.isLocked || state.gameResultApplied) {
    return state;
  }

  const finalScoreAdjustment =
    result === "draw" || !winner
      ? { white: 5, black: 5 }
      : winner === "white"
        ? { white: 25, black: 0 }
        : { white: 0, black: 25 };

  const nextRaw = {
    white: state.raw.white + finalScoreAdjustment.white,
    black: state.raw.black + finalScoreAdjustment.black,
  };
  const nextNormalized = {
    white: normalizeReiatsu(nextRaw.white),
    black: normalizeReiatsu(nextRaw.black),
  };

  const finalSnapshot = {
    finalWhiteReiatsu: nextNormalized.white,
    finalBlackReiatsu: nextNormalized.black,
  };

  const finalEvent: ReiatsuGameEndEvent = {
    type: "game_end",
    moveNumber,
    result,
    winner,
    finalScoreAdjustment,
    rawFinal: nextRaw,
    normalizedFinal: nextNormalized,
  };

  return {
    raw: nextRaw,
    normalized: nextNormalized,
    finalSnapshot,
    isLocked: true,
    gameResultApplied: true,
    history: [...state.history, finalEvent],
  };
}

export function getReiatsuSummaryStatistics(
  state: GameStateReiatsu
): ReiatsuSummaryStatistics {
  let totalMistakes = 0;
  let totalBlunders = 0;
  let totalGoodMoves = 0;
  let totalBestMoves = 0;

  for (const event of state.history) {
    if (!("qualityTag" in event)) {
      continue;
    }
    if (event.qualityTag === "mistake") totalMistakes++;
    if (event.qualityTag === "blunder") totalBlunders++;
    if (event.qualityTag === "good") totalGoodMoves++;
    if (event.qualityTag === "best") totalBestMoves++;
  }

  const finalScore = state.finalSnapshot
    ? {
        white: state.finalSnapshot.finalWhiteReiatsu,
        black: state.finalSnapshot.finalBlackReiatsu,
      }
    : {
        white: state.normalized.white,
        black: state.normalized.black,
      };

  return {
    totalMistakes,
    totalBlunders,
    totalGoodMoves,
    totalBestMoves,
    finalReiatsuScore: finalScore,
  };
}

export function exportReiatsuGameData(state: GameStateReiatsu): ReiatsuGameExport {
  return {
    moves: state.history
      .filter((event): event is MoveReiatsuEvent => !("type" in event))
      .map((event) => ({
        moveNumber: event.moveNumber,
        san: event.san,
        player: event.player,
        classification: event.qualityTag,
        evalBefore: event.evalBefore,
        evalAfter: event.evalAfter,
      })),
    reiatsuTimeline: state.history,
    summary: getReiatsuSummaryStatistics(state),
  };
}

export function exportReiatsuGameJson(
  state: GameStateReiatsu,
  prettyPrint = true
): string {
  return JSON.stringify(
    exportReiatsuGameData(state),
    null,
    prettyPrint ? 2 : 0
  );
}

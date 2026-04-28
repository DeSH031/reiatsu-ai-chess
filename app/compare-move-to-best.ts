import { Chess } from "chess.js";
import { evaluateMaterial } from "./evaluate-material";

export type ComparableMove = {
  from: string;
  to: string;
  promotion?: string;
};

export type BestMoveCandidate = ComparableMove & {
  san?: string;
};

export type MoveEvaluationComparison = {
  bestEval: number;
  playerEval: number;
  diff: number;
  bestMove: BestMoveCandidate | null;
};

function isSameMove(a: ComparableMove, b: ComparableMove): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
}

export function compareMoveToBest(
  fen: string,
  playerMove: ComparableMove
): MoveEvaluationComparison {
  const game = new Chess(fen);
  const legalMoves = game.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  }));

  if (legalMoves.length === 0) {
    const playerEval = evaluateMaterial(fen);
    return {
      bestEval: playerEval,
      playerEval,
      diff: 0,
      bestMove: null,
    };
  }

  const isWhiteToMove = game.turn() === "w";
  let bestEval = isWhiteToMove ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let playerEval: number | null = null;
  let bestMove: BestMoveCandidate | null = null;

  for (const legalMove of game.moves({ verbose: true })) {
    const nextPosition = new Chess(fen);
    nextPosition.move({
      from: legalMove.from,
      to: legalMove.to,
      promotion: legalMove.promotion,
    });
    const evaluation = evaluateMaterial(nextPosition.fen());

    const candidateMove: BestMoveCandidate = {
      from: legalMove.from,
      to: legalMove.to,
      promotion: legalMove.promotion,
      san: legalMove.san,
    };
    const isBetterMove = isWhiteToMove
      ? evaluation > bestEval
      : evaluation < bestEval;

    if (isBetterMove) {
      bestEval = evaluation;
      bestMove = candidateMove;
    }

    if (isSameMove(candidateMove, playerMove)) {
      playerEval = evaluation;
    }
  }

  if (playerEval === null) {
    throw new Error("Player move is not legal for the given position.");
  }

  return {
    bestEval,
    playerEval,
    diff: isWhiteToMove ? bestEval - playerEval : playerEval - bestEval,
    bestMove,
  };
}

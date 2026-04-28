import { Chess } from "chess.js";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function evaluateMaterial(fen: string): number {
  const game = new Chess(fen);
  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;

      const value = PIECE_VALUES[piece.type] ?? 0;
      if (piece.color === "w") {
        whiteMaterial += value;
      } else {
        blackMaterial += value;
      }
    }
  }

  return whiteMaterial - blackMaterial;
}

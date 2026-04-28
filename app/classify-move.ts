export type MoveQuality = "good" | "inaccuracy" | "blunder";

export function classifyMove(diff: number): MoveQuality {
  if (diff < 0.5) {
    return "good";
  }

  if (diff <= 2) {
    return "inaccuracy";
  }

  return "blunder";
}

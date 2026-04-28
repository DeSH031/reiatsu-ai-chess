export function isBlunder(diff: number): boolean {
  return Math.abs(diff) > 2;
}

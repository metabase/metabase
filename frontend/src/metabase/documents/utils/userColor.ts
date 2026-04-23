// Stable, deterministic color picker for collaborative-editing caret / awareness
// chips. Keyed by user-id so the same user always gets the same color in every
// session — more useful than a randomly-picked palette entry at each connection.

const PALETTE: readonly string[] = [
  "#1D8FE9", // blue
  "#EE6E73", // red
  "#2BBB80", // green
  "#F9CF48", // yellow
  "#B660E1", // purple
  "#FF8A4D", // orange
  "#1EB5B5", // teal
  "#E85CAF", // pink
  "#7E57C2", // deep purple
  "#4CAF50", // bright green
];

function djb2Hash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function userColor(userId: number): string {
  return PALETTE[djb2Hash(String(userId)) % PALETTE.length];
}

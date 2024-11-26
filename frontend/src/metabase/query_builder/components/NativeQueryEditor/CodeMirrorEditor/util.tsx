import type { Location } from "../types";

export function convertIndexToPosition(value: string, index: number): Location {
  let row = 0;
  let column = 0;

  for (let idx = 0; idx < index; idx++) {
    const ch = value[idx];
    if (ch === "\n") {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return {
    row,
    column,
  };
}

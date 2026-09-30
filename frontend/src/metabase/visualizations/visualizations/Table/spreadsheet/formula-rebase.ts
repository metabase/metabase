/**
 * Rewrites a formula's relative row references so it reads as the formula
 * for a different row, the way a spreadsheet's formula bar always shows
 * the selected cell's own formula rather than the one you originally
 * typed.
 *
 * A formula field stores one formula plus the row it was typed into (its
 * anchor row), and every other row is evaluated by offsetting the
 * relative references from there — see formula-engine.ts. So the formula
 * a given row "has" is this rewrite of the stored one, and showing the
 * stored text on every row both misreports what that row computes and,
 * because committing re-anchors to wherever the cursor is, would shift
 * the whole column on an accidental re-commit.
 */

/** Excel's marker for a reference that no longer points anywhere. */
export const INVALID_REFERENCE = "#REF!";

const CELL_REFERENCE = /^(\$?)([A-Za-z]+)(\$?)(\d+)/;
/** A ref can't start mid-identifier, or "log10" would read as one. */
const IDENTIFIER_CHARACTER = /[A-Za-z0-9_$]/;

function copyDelimited(
  formula: string,
  start: number,
  closing: string,
): { text: string; next: number } {
  let i = start + 1;
  let text = formula[start];
  while (i < formula.length) {
    const ch = formula[i];
    text += ch;
    i += 1;
    if (ch === "\\" && i < formula.length) {
      text += formula[i];
      i += 1;
      continue;
    }
    if (ch === closing) {
      break;
    }
  }
  return { text, next: i };
}

/**
 * Shifts every relative row reference in `formula` by `toRow - fromRow`,
 * both 0-based. `$`-pinned rows are left alone, and text values and
 * [Column Names] are copied through untouched so a "B2" inside a string
 * isn't rewritten.
 */
export function rebaseFormula(
  formula: string,
  fromRow: number,
  toRow: number,
): string {
  const delta = toRow - fromRow;
  if (delta === 0) {
    return formula;
  }

  let out = "";
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];

    if (ch === '"' || ch === "'") {
      const { text, next } = copyDelimited(formula, i, ch);
      out += text;
      i = next;
      continue;
    }
    if (ch === "[") {
      const { text, next } = copyDelimited(formula, i, "]");
      out += text;
      i = next;
      continue;
    }

    const startsIdentifier =
      i === 0 || !IDENTIFIER_CHARACTER.test(formula[i - 1]);
    const match = startsIdentifier
      ? formula.slice(i).match(CELL_REFERENCE)
      : null;
    // "round(" is a call, not a reference to column ROUND row 0.
    const isFunctionCall =
      match != null && formula[i + match[0].length] === "(";

    if (match && !isFunctionCall) {
      const [whole, columnPin, letters, rowPin, digits] = match;
      if (rowPin === "$") {
        out += whole;
      } else {
        const rebased = Number.parseInt(digits, 10) + delta;
        out +=
          rebased < 1
            ? INVALID_REFERENCE
            : `${columnPin}${letters}${rowPin}${rebased}`;
      }
      i += whole.length;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

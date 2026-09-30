import { columnLetterToIndex } from "./column-letters";
import { type FormulaAstNode, parseFormula } from "./formula-engine";

/** Stand-in end row for a whole-column reference, which has no last row
 * of its own. Highlight lookups only ever compare against it. */
const LAST_ROW = Number.MAX_SAFE_INTEGER;

/** A cell or range mentioned by the formula being typed, with the colour
 * slot it should be outlined in. */
export interface ReferenceHighlight {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  colorIndex: number;
}

/** How many distinct colours references cycle through, matching the
 * handful Excel/Sheets use before repeating. */
export const REFERENCE_COLOR_COUNT = 4;

// A single cell ref, optionally followed by ":" and another to form a
// range. Deliberately scanned with a regex rather than parseFormula: the
// text is mid-edit and usually not valid yet ("=SUM(A1:" has no parse),
// but the references typed so far should still light up.
const REFERENCE_PATTERN =
  /\$?([A-Za-z]+)\$?(\d+)(?:\s*:\s*\$?([A-Za-z]+)\$?(\d+))?/g;

/**
 * Finds every cell/range reference in an in-progress formula, in the
 * order typed, so the grid can outline them the way a spreadsheet does
 * while you build a formula. Rows/cols are 0-based and literal: "A1"
 * always means the cell shown as A1, regardless of the formula's anchor
 * row, which is what makes the highlight match what you typed.
 */
export function getReferenceHighlights(formula: string): ReferenceHighlight[] {
  // A formula that parses is walked instead of scanned, because the regex
  // below can't recognise a whole-column reference: "A" in SUM(A) is
  // indistinguishable from a function name without a grammar. Traversal
  // order matches reading order for anything you'd actually type, so the
  // colours come out in the same sequence either way.
  const parsed = highlightsFromAst(formula);
  if (parsed) {
    return parsed;
  }

  const highlights: ReferenceHighlight[] = [];
  REFERENCE_PATTERN.lastIndex = 0;

  let match = REFERENCE_PATTERN.exec(formula);
  while (match !== null) {
    const [, startLetters, startDigits, endLetters, endDigits] = match;
    const startCol = columnLetterToIndex(startLetters);
    const startRow = Number.parseInt(startDigits, 10) - 1;
    const endCol = endLetters ? columnLetterToIndex(endLetters) : startCol;
    const endRow = endDigits ? Number.parseInt(endDigits, 10) - 1 : startRow;

    if (startRow >= 0 && endRow >= 0) {
      highlights.push({
        startRow: Math.min(startRow, endRow),
        endRow: Math.max(startRow, endRow),
        startCol: Math.min(startCol, endCol),
        endCol: Math.max(startCol, endCol),
        colorIndex: highlights.length % REFERENCE_COLOR_COUNT,
      });
    }
    match = REFERENCE_PATTERN.exec(formula);
  }
  return highlights;
}

/** The colour slot a cell should be outlined in, or null when it isn't
 * referenced. Later references win, so the most recently typed one is
 * what you see on an overlapping cell. */
export function getHighlightColorIndex(
  highlights: ReferenceHighlight[],
  row: number,
  col: number,
): number | null {
  for (let i = highlights.length - 1; i >= 0; i--) {
    const h = highlights[i];
    if (
      row >= h.startRow &&
      row <= h.endRow &&
      col >= h.startCol &&
      col <= h.endCol
    ) {
      return h.colorIndex;
    }
  }
  return null;
}

/** Highlights from a formula that parses, in reading order. Returns null
 * when it doesn't parse, which is most of the time while typing. */
function highlightsFromAst(formula: string): ReferenceHighlight[] | null {
  // The text arrives straight from the editor, which keeps the leading
  // "=" that the parser doesn't take.
  const source = formula.startsWith("=") ? formula.slice(1) : formula;
  let ast: FormulaAstNode;
  try {
    ast = parseFormula(source);
  } catch {
    return null;
  }

  const highlights: ReferenceHighlight[] = [];
  const add = (
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ) =>
    highlights.push({
      startRow,
      endRow,
      startCol,
      endCol,
      colorIndex: highlights.length % REFERENCE_COLOR_COUNT,
    });

  const visit = (node: FormulaAstNode) => {
    switch (node.type) {
      case "cellRef":
        add(node.row, node.row, node.col, node.col);
        break;
      case "range":
        add(
          Math.min(node.start.row, node.end.row),
          Math.max(node.start.row, node.end.row),
          Math.min(node.start.col, node.end.col),
          Math.max(node.start.col, node.end.col),
        );
        break;
      case "columnRange":
        add(0, LAST_ROW, node.startCol, node.endCol);
        break;
      case "unaryMinus":
      case "not":
        visit(node.operand);
        break;
      case "binary":
        visit(node.left);
        visit(node.right);
        break;
      case "call":
        node.args.forEach(visit);
        break;
    }
  };
  visit(ast);
  return highlights;
}

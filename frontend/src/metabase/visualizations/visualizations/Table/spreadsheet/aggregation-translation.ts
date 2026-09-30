/**
 * Translates a range formula like SUM(D1:D200) into a Metabase
 * *aggregation*, which is the only query shape that can summarize rows.
 *
 * A custom column (mbql-translation.ts) is evaluated once per row and
 * cannot see any other row, which is why a range formula can never become
 * one. An aggregation can, but it collapses the result to a summary rather
 * than adding a column, so this is offered as an explicit action the user
 * takes rather than something that happens on commit.
 */

import { indexToColumnLetter } from "./column-letters";
import { type FormulaAstNode, parseFormula } from "./formula-engine";
import type { SpreadsheetField } from "./types";

/** Spreadsheet function -> the Metabase aggregation that means the same
 * thing. COUNT is the odd one: a spreadsheet counts values, so it maps to
 * CountIf(notNull(...)) rather than Count, which counts rows. */
const AGGREGATION_BY_FUNCTION: Record<
  string,
  (column: string) => { source: string; verb: string }
> = {
  SUM: (column) => ({ source: `Sum(${column})`, verb: "Sum" }),
  AVERAGE: (column) => ({ source: `Average(${column})`, verb: "Average" }),
  MIN: (column) => ({ source: `Min(${column})`, verb: "Min" }),
  MAX: (column) => ({ source: `Max(${column})`, verb: "Max" }),
  COUNT: (column) => ({
    source: `CountIf(notNull(${column}))`,
    verb: "Count",
  }),
};

export type AggregationTranslation =
  | {
      ok: true;
      /** Metabase aggregation syntax, e.g. "Sum([Subtotal])". */
      expressionSource: string;
      /** What the resulting summary is called, e.g. "Sum of Subtotal". */
      label: string;
    }
  | { ok: false; reason: string };

function quoteColumn(name: string): string {
  return `[${name.replace(/\\/g, "\\\\").replace(/\]/g, "\\]")}]`;
}

/** The columns an aggregate's argument covers, or null when it isn't a
 * column reference at all. A named column has no index, so it reports a
 * single-column span and is resolved by name later. */
function columnSpanOf(
  node: FormulaAstNode,
): { startCol: number; endCol: number } | null {
  switch (node.type) {
    case "range":
      return {
        startCol: Math.min(node.start.col, node.end.col),
        endCol: Math.max(node.start.col, node.end.col),
      };
    case "columnRange":
      return { startCol: node.startCol, endCol: node.endCol };
    case "columnRef":
      return { startCol: -1, endCol: -1 };
    default:
      return null;
  }
}

/**
 * Whether a formula is a single range aggregate this can convert. Anything
 * more involved, such as SUM(A1:A10)/2 or a range spanning two columns,
 * is rejected: the first needs a post-aggregation stage and the second has
 * no single column to summarize, and neither is worth guessing at.
 */
export function translateAggregateFormula(
  formula: string,
  fields: SpreadsheetField[],
): AggregationTranslation {
  let ast: FormulaAstNode;
  try {
    ast = parseFormula(formula);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "couldn't parse formula",
    };
  }

  if (ast.type !== "call") {
    return { ok: false, reason: "not a summary formula" };
  }
  const build = AGGREGATION_BY_FUNCTION[ast.name];
  if (!build) {
    return { ok: false, reason: `${ast.name} has no summary equivalent` };
  }
  if (ast.args.length !== 1) {
    return {
      ok: false,
      reason: `${ast.name} can only be summarized when it covers a single column, e.g. ${ast.name}(A)`,
    };
  }

  const arg = ast.args[0];
  const columns = columnSpanOf(arg);
  if (!columns) {
    return {
      ok: false,
      reason: `${ast.name} can only be summarized when it covers a single column, e.g. ${ast.name}(A)`,
    };
  }
  if (columns.startCol !== columns.endCol) {
    return {
      ok: false,
      reason: `${indexToColumnLetter(columns.startCol)}:${indexToColumnLetter(
        columns.endCol,
      )} spans several columns — summarize one column at a time`,
    };
  }

  // A column referenced by name is already the thing to aggregate, so it
  // skips the field lookup entirely: SUM([Subtotal]) is Metabase's own
  // spelling and needs no translation beyond the function.
  if (arg.type === "columnRef") {
    const { source, verb } = build(quoteColumn(arg.name));
    return {
      ok: true,
      expressionSource: source,
      label: `${verb} of ${arg.name}`,
    };
  }

  const field = fields[columns.startCol];
  if (!field) {
    return { ok: false, reason: "that column is empty" };
  }
  if (field.kind !== "source") {
    return {
      ok: false,
      reason: `${field.name} is a formula column — save it as a column first, then summarize it`,
    };
  }

  const { source, verb } = build(quoteColumn(field.name));
  return {
    ok: true,
    expressionSource: source,
    label: `${verb} of ${field.name}`,
  };
}

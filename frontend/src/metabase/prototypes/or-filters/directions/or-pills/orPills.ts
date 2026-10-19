import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";

/**
 * One pill's conditions. Rows are joined by OR, clauses within a row by AND,
 * so a pill is `or(and(...), and(...))`. Pills themselves are the stage's
 * top-level filters, which the query engine ANDs together.
 */
export type PillRows = Lib.FilterClause[][];

export function readPillRows(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): PillRows {
  const parts = Lib.expressionParts(query, stageIndex, filter);
  const readRow = (arg: Lib.ExpressionArg | Lib.ExpressionParts) => {
    const members =
      isExpressionParts(arg) && arg.operator === "and" ? arg.args : [arg];
    return members.map((member) =>
      toFilterClause(query, stageIndex, Lib.expressionClause(member)),
    );
  };

  if (parts.operator === "or") {
    return parts.args.map(readRow);
  }
  if (parts.operator === "and") {
    return [readRow(parts)];
  }
  return [[filter]];
}

/** Collapses rows into one clause, or `undefined` when every row is empty. */
export function toPillClause(
  rows: PillRows,
): Lib.FilterClause | Lib.ExpressionClause | undefined {
  const rowClauses = rows
    .filter((row) => row.length > 0)
    .map((row) =>
      row.length === 1 ? row[0] : Lib.expressionClause("and", row),
    );

  if (rowClauses.length === 0) {
    return undefined;
  }
  return rowClauses.length === 1
    ? rowClauses[0]
    : Lib.expressionClause("or", rowClauses);
}

/** Replaces `filter` with the clause built from `rows`, or removes it. */
export function writePillRows(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  rows: PillRows,
): Lib.Query {
  const clause = toPillClause(rows);
  return clause
    ? Lib.replaceClause(query, stageIndex, filter, clause)
    : Lib.removeClause(query, stageIndex, filter);
}

export function updateRow(
  rows: PillRows,
  rowIndex: number,
  update: (row: Lib.FilterClause[]) => Lib.FilterClause[],
): PillRows {
  return rows
    .map((row, index) => (index === rowIndex ? update(row) : row))
    .filter((row) => row.length > 0);
}

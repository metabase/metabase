import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";

/**
 * One pill's conditions, three levels deep. Rows are joined by OR, items
 * within a row by AND, and a subgroup item holds clauses joined by OR again:
 * `or(and(clause, or(clause, clause)), ...)`. Pills themselves are the
 * stage's top-level filters, which the query engine ANDs together.
 */
export type Subgroup = { type: "subgroup"; clauses: Lib.FilterClause[] };
export type RowItem = { type: "clause"; clause: Lib.FilterClause } | Subgroup;
export type PillRow = RowItem[];
export type PillRows = PillRow[];

/** Where a clause lives; `clauseIndex` is set only inside a subgroup. */
export type ClausePath = {
  rowIndex: number;
  itemIndex: number;
  clauseIndex?: number;
};

/** Where a picked clause goes. A `row` target past the last row starts a new row. */
export type AddTarget =
  | { kind: "row"; rowIndex: number }
  | { kind: "new-subgroup"; rowIndex: number }
  | { kind: "subgroup"; rowIndex: number; itemIndex: number };

export function readPillRows(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): PillRows {
  const parts = Lib.expressionParts(query, stageIndex, filter);
  const readClause = (arg: Lib.ExpressionArg | Lib.ExpressionParts) =>
    toFilterClause(query, stageIndex, Lib.expressionClause(arg));
  const readItem = (arg: Lib.ExpressionArg | Lib.ExpressionParts): RowItem =>
    isExpressionParts(arg) && arg.operator === "or"
      ? { type: "subgroup", clauses: arg.args.map(readClause) }
      : { type: "clause", clause: readClause(arg) };
  const readRow = (arg: Lib.ExpressionArg | Lib.ExpressionParts): PillRow => {
    const members =
      isExpressionParts(arg) && arg.operator === "and" ? arg.args : [arg];
    return members.map(readItem);
  };

  if (parts.operator === "or") {
    return parts.args.map(readRow);
  }
  if (parts.operator === "and") {
    return [readRow(parts)];
  }
  return [[{ type: "clause", clause: filter }]];
}

function toItemClause(item: RowItem) {
  if (item.type === "clause") {
    return item.clause;
  }
  return item.clauses.length === 1
    ? item.clauses[0]
    : Lib.expressionClause("or", item.clauses);
}

function toRowClauses(rows: PillRows) {
  return rows
    .filter((row) => row.length > 0)
    .map((row) => {
      const itemClauses = row.map(toItemClause);
      return itemClauses.length === 1
        ? itemClauses[0]
        : Lib.expressionClause("and", itemClauses);
    });
}

/** Collapses rows into one clause, or `undefined` when every row is empty. */
export function toPillClause(
  rows: PillRows,
): Lib.FilterClause | Lib.ExpressionClause | undefined {
  const rowClauses = toRowClauses(rows);
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

/**
 * Ungroups a pill: removes `filter` and adds each row as its own top-level
 * filter. Top-level filters are AND-ed, so this changes the query's logic.
 */
export function expandPillRows(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  rows: PillRows,
): Lib.Query {
  const withoutPill = Lib.removeClause(query, stageIndex, filter);
  return toRowClauses(rows).reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    withoutPill,
  );
}

function updateRow(
  rows: PillRows,
  rowIndex: number,
  update: (row: PillRow) => PillRow,
): PillRows {
  return rows
    .map((row, index) => (index === rowIndex ? update(row) : row))
    .filter((row) => row.length > 0);
}

function updateSubgroup(
  rows: PillRows,
  rowIndex: number,
  itemIndex: number,
  update: (clauses: Lib.FilterClause[]) => Lib.FilterClause[],
): PillRows {
  return updateRow(rows, rowIndex, (row) =>
    row
      .map((item, index) =>
        index === itemIndex && item.type === "subgroup"
          ? { ...item, clauses: update(item.clauses) }
          : item,
      )
      .filter((item) => item.type === "clause" || item.clauses.length > 0),
  );
}

export function addClause(
  rows: PillRows,
  target: AddTarget,
  clause: Lib.FilterClause,
): PillRows {
  switch (target.kind) {
    case "row":
      return target.rowIndex === rows.length
        ? [...rows, [{ type: "clause", clause }]]
        : updateRow(rows, target.rowIndex, (row) => [
            ...row,
            { type: "clause", clause },
          ]);
    case "new-subgroup":
      return updateRow(rows, target.rowIndex, (row) => [
        ...row,
        { type: "subgroup", clauses: [clause] },
      ]);
    case "subgroup":
      return updateSubgroup(
        rows,
        target.rowIndex,
        target.itemIndex,
        (clauses) => [...clauses, clause],
      );
  }
}

export function replaceClause(
  rows: PillRows,
  path: ClausePath,
  clause: Lib.FilterClause,
): PillRows {
  const { rowIndex, itemIndex, clauseIndex } = path;
  if (clauseIndex != null) {
    return updateSubgroup(rows, rowIndex, itemIndex, (clauses) =>
      clauses.map((member, index) => (index === clauseIndex ? clause : member)),
    );
  }
  return updateRow(rows, rowIndex, (row) =>
    row.map((item, index) =>
      index === itemIndex ? { type: "clause", clause } : item,
    ),
  );
}

export function removeClause(rows: PillRows, path: ClausePath): PillRows {
  const { rowIndex, itemIndex, clauseIndex } = path;
  if (clauseIndex != null) {
    return updateSubgroup(rows, rowIndex, itemIndex, (clauses) =>
      clauses.filter((_member, index) => index !== clauseIndex),
    );
  }
  return updateRow(rows, rowIndex, (row) =>
    row.filter((_item, index) => index !== itemIndex),
  );
}

export function getClause(rows: PillRows, path: ClausePath) {
  const item = rows[path.rowIndex]?.[path.itemIndex];
  if (item?.type === "clause") {
    return item.clause;
  }
  return path.clauseIndex != null ? item?.clauses[path.clauseIndex] : undefined;
}

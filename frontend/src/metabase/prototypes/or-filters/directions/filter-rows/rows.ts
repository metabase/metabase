import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";

/**
 * A group is a list of rows OR-ed together; a row is a list of items AND-ed
 * together; an item is a filter or a nested group. Connectors are fixed by
 * position, so nothing about them is stored.
 */
export type RowItem =
  | { type: "filter"; clause: Lib.FilterClause }
  | { type: "group"; rows: FilterRow[] };

export type FilterRow = { id: string; items: RowItem[] };

type Clause = Lib.FilterClause | Lib.ExpressionClause;
type Node = Lib.ExpressionArg | Lib.ExpressionParts;

let nextRowId = 0;

export function createRow(items: RowItem[] = []): FilterRow {
  return { id: `filter-row-${nextRowId++}`, items };
}

function isOperator(node: Node, operator: "and" | "or") {
  return isExpressionParts(node) && node.operator === operator;
}

/**
 * Stage filters are AND-ed. The first OR among them gives the rows; every
 * other filter (a drill, say) is AND-ed onto each row.
 */
export function readRows(query: Lib.Query, stageIndex: number): FilterRow[] {
  const toItem = (node: Node, filter?: Lib.FilterClause): RowItem =>
    isOperator(node, "or") && isExpressionParts(node)
      ? { type: "group", rows: toRows(node) }
      : {
          type: "filter",
          clause:
            filter ??
            toFilterClause(query, stageIndex, Lib.expressionClause(node)),
        };
  const toItems = (node: Node): RowItem[] =>
    isOperator(node, "and") && isExpressionParts(node)
      ? node.args.flatMap(toItems)
      : [toItem(node)];
  const toRows = (node: Node): FilterRow[] =>
    isOperator(node, "or") && isExpressionParts(node)
      ? node.args.flatMap(toRows)
      : [createRow(toItems(node))];

  const filters = Lib.filters(query, stageIndex).map((filter) => ({
    filter,
    parts: Lib.expressionParts(query, stageIndex, filter),
  }));
  const orIndex = filters.findIndex(({ parts }) => isOperator(parts, "or"));
  const shared = filters
    .filter((_, index) => index !== orIndex)
    .flatMap(({ filter, parts }) =>
      isOperator(parts, "and") ? toItems(parts) : [toItem(parts, filter)],
    );
  if (orIndex < 0) {
    return [createRow(shared)];
  }
  return toRows(filters[orIndex].parts).map((row) =>
    createRow([...row.items, ...shared]),
  );
}

/** One row writes its filters as separate pills; several write one OR. */
export function writeRows(
  query: Lib.Query,
  stageIndex: number,
  rows: FilterRow[],
): Lib.Query {
  // A drilled filter shared by every row must get a fresh uuid per copy.
  const seen = new Set<Lib.FilterClause>();
  const fresh = (clause: Lib.FilterClause) => {
    if (seen.has(clause)) {
      return toFilterClause(query, stageIndex, clause);
    }
    seen.add(clause);
    return clause;
  };
  const combine = (operator: "and" | "or", clauses: Clause[]) =>
    clauses.length <= 1 ? clauses[0] : Lib.expressionClause(operator, clauses);
  const itemClause = (item: RowItem): Clause | undefined =>
    item.type === "filter" ? fresh(item.clause) : groupClause(item.rows);
  const rowClauses = (row: FilterRow) =>
    row.items.flatMap((item) => itemClause(item) ?? []);
  const groupClause = (group: FilterRow[]): Clause | undefined =>
    combine(
      "or",
      group.flatMap((row) => combine("and", rowClauses(row)) ?? []),
    );

  const nonEmpty = rows.filter((row) => rowClauses(row).length > 0);
  const clauses =
    nonEmpty.length === 1
      ? rowClauses(nonEmpty[0])
      : [groupClause(nonEmpty) ?? []].flat();
  return clauses.reduce(
    (result, clause) => Lib.filter(result, stageIndex, clause),
    clearFilters(query, stageIndex),
  );
}

/** Every row, nested ones included, in reading order. */
export function flattenRows(rows: FilterRow[]): FilterRow[] {
  return rows.flatMap((row) => [
    row,
    ...row.items.flatMap((item) =>
      item.type === "group" ? flattenRows(item.rows) : [],
    ),
  ]);
}

/** The row that holds the group `rowId` sits in, if it is nested. */
export function findParentRow(
  rows: FilterRow[],
  rowId: string,
): FilterRow | undefined {
  return flattenRows(rows).find((row) =>
    row.items.some(
      (item) =>
        item.type === "group" && item.rows.some((child) => child.id === rowId),
    ),
  );
}

/** Applies `update` to the list of sibling rows that holds `rowId`. */
function updateSiblings(
  rows: FilterRow[],
  rowId: string,
  update: (siblings: FilterRow[]) => FilterRow[],
): FilterRow[] {
  if (rows.some((row) => row.id === rowId)) {
    return update(rows);
  }
  return rows.map((row) => ({
    ...row,
    items: row.items.flatMap((item): RowItem[] => {
      if (item.type !== "group") {
        return [item];
      }
      const nextRows = updateSiblings(item.rows, rowId, update);
      // A nested group with no rows left disappears.
      return nextRows.length > 0 ? [{ ...item, rows: nextRows }] : [];
    }),
  }));
}

export function updateRow(
  rows: FilterRow[],
  rowId: string,
  update: (row: FilterRow) => FilterRow,
): FilterRow[] {
  return updateSiblings(rows, rowId, (siblings) =>
    siblings.map((row) => (row.id === rowId ? update(row) : row)),
  );
}

export function insertRowAfter(
  rows: FilterRow[],
  rowId: string,
  newRow: FilterRow,
): FilterRow[] {
  return updateSiblings(rows, rowId, (siblings) =>
    siblings.flatMap((row) => (row.id === rowId ? [row, newRow] : [row])),
  );
}

export function removeRow(rows: FilterRow[], rowId: string): FilterRow[] {
  return updateSiblings(rows, rowId, (siblings) =>
    siblings.filter((row) => row.id !== rowId),
  );
}

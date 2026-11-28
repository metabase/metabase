import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";

/**
 * Query-by-example grid: columns are data columns, each row is a segment.
 * Cells on a row are AND-ed, rows are OR-ed, an empty cell means "any".
 * A clause the picker cannot edit per column (a custom expression) lands in
 * the "Custom expression" column.
 */
export const CUSTOM_COLUMN_KEY = "Custom expression";

export type GridColumn = {
  key: string;
  column?: Lib.ColumnMetadata;
};

/** One segment: a clause per column key. */
export type GridRow = Map<string, Lib.FilterClause>;

export type Grid = {
  columns: GridColumn[];
  rows: GridRow[];
};

export function columnKey(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, column).longDisplayName;
}

function clauseColumn(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
): GridColumn {
  const column = Lib.filterParts(query, stageIndex, clause)?.column;
  return column
    ? { key: columnKey(query, stageIndex, column), column }
    : { key: CUSTOM_COLUMN_KEY };
}

export function readGrid(query: Lib.Query, stageIndex: number): Grid {
  const filters = Lib.filters(query, stageIndex);
  const readClause = (arg: Lib.ExpressionArg | Lib.ExpressionParts) =>
    toFilterClause(query, stageIndex, Lib.expressionClause(arg));
  const flattenAnd = (
    arg: Lib.ExpressionArg | Lib.ExpressionParts,
  ): Lib.FilterClause[] =>
    isExpressionParts(arg) && arg.operator === "and"
      ? arg.args.flatMap(flattenAnd)
      : [readClause(arg)];

  const [only] = filters;
  const onlyParts =
    filters.length === 1 && only
      ? Lib.expressionParts(query, stageIndex, only)
      : undefined;
  const rowClauses =
    onlyParts?.operator === "or"
      ? onlyParts.args.map(flattenAnd)
      : [
          filters.flatMap((filter) =>
            flattenAnd(Lib.expressionParts(query, stageIndex, filter)),
          ),
        ];

  const columns = new Map<string, GridColumn>();
  const rows = rowClauses.map((clauses) => {
    const row: GridRow = new Map();
    clauses.forEach((clause) => {
      const base = clauseColumn(query, stageIndex, clause);
      // A second condition on the same column in one row gets its own column.
      const gridColumn = row.has(base.key)
        ? { ...base, key: `${base.key} (${countKeys(row, base.key) + 1})` }
        : base;
      columns.set(gridColumn.key, gridColumn);
      row.set(gridColumn.key, clause);
    });
    return row;
  });
  return {
    columns: [...columns.values()],
    rows: rows.length ? rows : [new Map()],
  };
}

function countKeys(row: GridRow, key: string): number {
  return [...row.keys()].filter((candidate) => candidate.startsWith(key))
    .length;
}

function rowClause(row: GridRow): Lib.Filterable | undefined {
  const clauses = [...row.values()];
  if (clauses.length === 0) {
    return undefined;
  }
  return clauses.length === 1
    ? clauses[0]
    : Lib.expressionClause("and", clauses);
}

/** Replaces the stage's filters: one row writes plain filters, more rows write one OR. */
export function writeGrid(
  query: Lib.Query,
  stageIndex: number,
  grid: Grid,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  const rows = grid.rows
    .map(rowClause)
    .filter((clause): clause is Lib.Filterable => clause != null);
  if (rows.length === 0) {
    return cleared;
  }
  if (rows.length === 1) {
    return [...(grid.rows.find((row) => row.size > 0) ?? [])].reduce(
      (nextQuery, [, clause]) => Lib.filter(nextQuery, stageIndex, clause),
      cleared,
    );
  }
  return Lib.filter(cleared, stageIndex, Lib.expressionClause("or", rows));
}

const copyRow = (row: GridRow): GridRow => new Map(row);

export function addColumn(grid: Grid, column: GridColumn): Grid {
  return grid.columns.some((candidate) => candidate.key === column.key)
    ? grid
    : { ...grid, columns: [...grid.columns, column] };
}

export function removeColumn(grid: Grid, key: string): Grid {
  return {
    columns: grid.columns.filter((column) => column.key !== key),
    rows: grid.rows.map((row) => {
      const next = copyRow(row);
      next.delete(key);
      return next;
    }),
  };
}

export function setCell(
  grid: Grid,
  rowIndex: number,
  key: string,
  clause: Lib.FilterClause | undefined,
): Grid {
  return {
    ...grid,
    rows: grid.rows.map((row, index) => {
      if (index !== rowIndex) {
        return row;
      }
      const next = copyRow(row);
      if (clause) {
        next.set(key, clause);
      } else {
        next.delete(key);
      }
      return next;
    }),
  };
}

/** The same clause with fresh uuids, so it can live in the query twice. */
function cloneClause(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.FilterClause,
): Lib.FilterClause {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  return toFilterClause(query, stageIndex, Lib.expressionClause(parts));
}

export function duplicateRow(
  query: Lib.Query,
  stageIndex: number,
  grid: Grid,
  rowIndex: number,
): Grid {
  const source = grid.rows[rowIndex];
  if (!source) {
    return grid;
  }
  const copy: GridRow = new Map(
    [...source.entries()].map(([key, clause]) => [
      key,
      cloneClause(query, stageIndex, clause),
    ]),
  );
  const rows = [...grid.rows];
  rows.splice(rowIndex + 1, 0, copy);
  return { ...grid, rows };
}

export function removeRow(grid: Grid, rowIndex: number): Grid {
  const rows = grid.rows.filter((_row, index) => index !== rowIndex);
  return { ...grid, rows: rows.length ? rows : [new Map()] };
}

export function addRow(grid: Grid): Grid {
  return { ...grid, rows: [...grid.rows, new Map()] };
}

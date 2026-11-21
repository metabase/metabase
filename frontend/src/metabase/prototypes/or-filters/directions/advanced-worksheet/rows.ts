import { arrayMove } from "@dnd-kit/sortable";

import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";

export type Connector = "and" | "or";

/**
 * One line of the worksheet. Rows form an outline: a row's subgroups are the
 * rows right after it with a greater depth. Every connector is stored as the
 * user set it, nothing is normalized.
 */
export type WorksheetRow = {
  id: string;
  depth: number;
  /** Joins this row to what precedes it at its level. Unused on the first row. */
  connector: Connector;
  filters: Lib.FilterClause[];
  /** `connectors[i]` joins `filters[i]` and `filters[i + 1]`. */
  connectors: Connector[];
};

/** Depths 0, 1 and 2: three levels. */
export const MAX_DEPTH = 2;

type Clause = Lib.FilterClause | Lib.ExpressionClause;
type Term = { connector: Connector; clause: Clause };

let nextRowId = 0;

export function createRow(
  depth: number,
  connector: Connector = "and",
  filters: Lib.FilterClause[] = [],
  operator: Connector = "and",
): WorksheetRow {
  return {
    id: `row-${nextRowId++}`,
    depth,
    connector,
    filters,
    connectors: filters.slice(1).map(() => operator),
  };
}

export function toggle(connector: Connector): Connector {
  return connector === "and" ? "or" : "and";
}

/** Mixed connectors read like SQL: AND binds tighter than OR. */
function combine(terms: Term[]): Clause | undefined {
  const segments = terms.reduce<Clause[][]>((result, term, index) => {
    if (index === 0 || term.connector === "or") {
      return [...result, [term.clause]];
    }
    const last = result[result.length - 1];
    return [...result.slice(0, -1), [...last, term.clause]];
  }, []);
  const conjunctions = segments.map((segment) =>
    segment.length === 1 ? segment[0] : Lib.expressionClause("and", segment),
  );
  if (conjunctions.length <= 1) {
    return conjunctions[0];
  }
  return Lib.expressionClause("or", conjunctions);
}

/** Terms for the rows from `start` that sit deeper than `parentDepth`. */
function collectChildTerms(
  rows: WorksheetRow[],
  start: number,
  parentDepth: number,
): { terms: Term[]; end: number } {
  const terms: Term[] = [];
  let index = start;
  while (index < rows.length && rows[index].depth > parentDepth) {
    const row = rows[index];
    const children = collectChildTerms(rows, index + 1, row.depth);
    const clause = combine([
      ...row.filters.map((filter, filterIndex) => ({
        connector:
          filterIndex === 0 ? row.connector : row.connectors[filterIndex - 1],
        clause: filter,
      })),
      ...children.terms,
    ]);
    if (clause) {
      terms.push({ connector: row.connector, clause });
    }
    index = children.end;
  }
  return { terms, end: index };
}

/**
 * When every top-level connector is AND, each top-level row is its own stage
 * filter, so a lone condition shows as a plain pill in the bar.
 */
function toStageClauses(rows: WorksheetRow[]): Clause[] {
  const { terms } = collectChildTerms(rows, 0, -1);
  const isAllAnd = terms.every(
    (term, index) => index === 0 || term.connector === "and",
  );
  if (isAllAnd) {
    return terms.map((term) => term.clause);
  }
  return [combine(terms) ?? []].flat();
}

// Rows survive a round trip through the query, so the layout the user built
// comes back as they left it instead of being re-derived.
const rowsByQuery = new WeakMap<Lib.Query, WorksheetRow[]>();

/** Replaces `replacedFilters` (by default all of the stage's) with `rows`. */
export function writeRows(
  query: Lib.Query,
  stageIndex: number,
  rows: WorksheetRow[],
  replacedFilters?: Lib.FilterClause[],
): Lib.Query {
  const cleared = (replacedFilters ?? Lib.filters(query, stageIndex)).reduce(
    (nextQuery, filter) => Lib.removeClause(nextQuery, stageIndex, filter),
    query,
  );
  const nextQuery = toStageClauses(rows).reduce(
    (result, clause) => Lib.filter(result, stageIndex, clause),
    cleared,
  );
  if (!replacedFilters) {
    rowsByQuery.set(nextQuery, rows);
  }
  return nextQuery;
}

/** Rows for `filters` (by default all of the stage's), AND-ed together. */
export function readRows(
  query: Lib.Query,
  stageIndex: number,
  filters?: Lib.FilterClause[],
): WorksheetRow[] {
  const cached = filters ? undefined : rowsByQuery.get(query);
  if (cached) {
    return cached;
  }
  const readFilters = filters ?? Lib.filters(query, stageIndex);
  const rows = readFilters.flatMap((filter) =>
    readNode(
      query,
      stageIndex,
      Lib.expressionParts(query, stageIndex, filter),
      filter,
      0,
      "and",
      readFilters.length === 1,
    ),
  );
  if (!filters) {
    // Cached so re-renders keep the same row ids.
    rowsByQuery.set(query, rows);
  }
  return rows;
}

/** A single condition, as opposed to an and/or group. */
export function isSimpleFilter(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): boolean {
  return !isConnector(Lib.expressionParts(query, stageIndex, filter).operator);
}

function isConnector(operator: string): operator is Connector {
  return operator === "and" || operator === "or";
}

/** A group becomes one row of its plain filters, its subgroups one step in. */
function readNode(
  query: Lib.Query,
  stageIndex: number,
  node: Lib.ExpressionArg | Lib.ExpressionParts,
  filter: Lib.FilterClause | undefined,
  depth: number,
  connector: Connector,
  canSpill = false,
): WorksheetRow[] {
  if (!isExpressionParts(node) || !isConnector(node.operator)) {
    const clause =
      filter ?? toFilterClause(query, stageIndex, Lib.expressionClause(node));
    return [createRow(depth, connector, [clause])];
  }
  const operator = node.operator;
  const isGroup = (arg: Lib.ExpressionArg | Lib.ExpressionParts) =>
    isExpressionParts(arg) && isConnector(arg.operator);
  const filters = node.args
    .filter((arg) => !isGroup(arg))
    .map((arg) => toFilterClause(query, stageIndex, Lib.expressionClause(arg)));
  const subgroups = node.args.filter(isGroup);
  // A group of only subgroups has no row of its own. Its subgroups can only
  // move up a level when nothing else shares that level, or AND-before-OR
  // would regroup them with their neighbours.
  if (filters.length === 0 && canSpill) {
    return subgroups.flatMap((arg, index) =>
      readNode(
        query,
        stageIndex,
        arg,
        undefined,
        depth,
        index === 0 ? connector : operator,
      ),
    );
  }
  const childDepth = Math.min(depth + 1, MAX_DEPTH);
  return [
    createRow(depth, connector, filters, operator),
    ...subgroups.flatMap((arg) =>
      readNode(query, stageIndex, arg, undefined, childDepth, operator),
    ),
  ];
}

export function countFilters(rows: WorksheetRow[]): number {
  return rows.reduce((count, row) => count + row.filters.length, 0);
}

/** The row plus its subgroups, as `[start, end)`. */
export function getBlockRange(rows: WorksheetRow[], index: number) {
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) {
    end++;
  }
  return { start: index, end };
}

/** Keeps the outline valid: a row is at most one step deeper than the one above. */
export function normalizeDepths(rows: WorksheetRow[]): WorksheetRow[] {
  return rows.reduce<WorksheetRow[]>((result, row) => {
    const previous = result[result.length - 1];
    const maxDepth = previous ? Math.min(previous.depth + 1, MAX_DEPTH) : 0;
    return [...result, { ...row, depth: Math.min(row.depth, maxDepth) }];
  }, []);
}

export function updateRow(
  rows: WorksheetRow[],
  rowId: string,
  update: (row: WorksheetRow) => WorksheetRow,
): WorksheetRow[] {
  return rows.map((row) => (row.id === rowId ? update(row) : row));
}

export function addFilterToRow(
  row: WorksheetRow,
  filter: Lib.FilterClause,
): WorksheetRow {
  const connector = row.connectors[row.connectors.length - 1] ?? "and";
  return {
    ...row,
    filters: [...row.filters, filter],
    connectors: row.filters.length > 0 ? [...row.connectors, connector] : [],
  };
}

export function removeFilterFromRow(
  row: WorksheetRow,
  filterIndex: number,
): WorksheetRow {
  const connectorIndex = Math.max(filterIndex - 1, 0);
  return {
    ...row,
    filters: row.filters.filter((_, index) => index !== filterIndex),
    connectors: row.connectors.filter((_, index) => index !== connectorIndex),
  };
}

export function removeBlock(rows: WorksheetRow[], index: number) {
  const { start, end } = getBlockRange(rows, index);
  return normalizeDepths([...rows.slice(0, start), ...rows.slice(end)]);
}

/** Copies get fresh clauses, so no uuid appears twice in the query. */
export function duplicateBlock(
  rows: WorksheetRow[],
  index: number,
  cloneFilter: (filter: Lib.FilterClause) => Lib.FilterClause,
) {
  const { start, end } = getBlockRange(rows, index);
  const copies = rows.slice(start, end).map((row) => ({
    ...row,
    id: createRow(0).id,
    filters: row.filters.map(cloneFilter),
  }));
  return [...rows.slice(0, end), ...copies, ...rows.slice(end)];
}

/** Merges a row into the row it hangs from; its subgroups move up a level. */
export function ungroupRow(rows: WorksheetRow[], index: number) {
  const row = rows[index];
  const parentIndex = rows
    .slice(0, index)
    .findLastIndex((candidate) => candidate.depth < row.depth);
  if (parentIndex < 0) {
    return rows;
  }
  const { end } = getBlockRange(rows, index);
  return rows.flatMap((candidate, candidateIndex) => {
    if (candidateIndex === parentIndex) {
      return [
        {
          ...candidate,
          filters: [...candidate.filters, ...row.filters],
          connectors: [
            ...candidate.connectors,
            ...(candidate.filters.length > 0 && row.filters.length > 0
              ? [row.connector]
              : []),
            ...row.connectors,
          ],
        },
      ];
    }
    if (candidateIndex === index) {
      return [];
    }
    if (candidateIndex > index && candidateIndex < end) {
      return [{ ...candidate, depth: candidate.depth - 1 }];
    }
    return [candidate];
  });
}

/** Rows to show while `activeId` is dragged: its subgroups travel with it. */
export function getVisibleRows(rows: WorksheetRow[], activeId?: string) {
  const activeIndex = rows.findIndex((row) => row.id === activeId);
  if (activeIndex < 0) {
    return rows;
  }
  const { end } = getBlockRange(rows, activeIndex);
  return [...rows.slice(0, activeIndex + 1), ...rows.slice(end)];
}

/** Where the dragged row would land, given how far it was dragged sideways. */
export function getProjectedDepth(
  rows: WorksheetRow[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentPx: number,
) {
  const visibleRows = getVisibleRows(rows, activeId);
  const activeIndex = visibleRows.findIndex((row) => row.id === activeId);
  const overIndex = visibleRows.findIndex((row) => row.id === overId);
  const moved = arrayMove(visibleRows, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const activeRow = visibleRows[activeIndex];
  const fullIndex = rows.findIndex((row) => row.id === activeId);
  const { start, end } = getBlockRange(rows, fullIndex);
  const span = Math.max(
    ...rows.slice(start, end).map((row) => row.depth - activeRow.depth),
  );
  const maxDepth = previous
    ? Math.min(previous.depth + 1, MAX_DEPTH - span)
    : 0;
  const projected = activeRow.depth + Math.round(offsetX / indentPx);
  return Math.max(0, Math.min(projected, maxDepth));
}

export function moveBlock(
  rows: WorksheetRow[],
  activeId: string,
  overId: string,
  depth: number,
): WorksheetRow[] {
  const visibleRows = getVisibleRows(rows, activeId);
  const moved = arrayMove(
    visibleRows,
    visibleRows.findIndex((row) => row.id === activeId),
    visibleRows.findIndex((row) => row.id === overId),
  );
  const insertAt = moved.findIndex((row) => row.id === activeId);
  const fullIndex = rows.findIndex((row) => row.id === activeId);
  const { start, end } = getBlockRange(rows, fullIndex);
  const shift = depth - rows[fullIndex].depth;
  const block = rows
    .slice(start, end)
    .map((row) => ({ ...row, depth: row.depth + shift }));
  const rest = [...rows.slice(0, start), ...rows.slice(end)];
  return normalizeDepths([
    ...rest.slice(0, insertAt),
    ...block,
    ...rest.slice(insertAt),
  ]);
}

import { t } from "ttag";

import { formatExpressionParts } from "metabase/querying/expressions";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { AGGREGATION_FUNCTIONS, EXPRESSION_FUNCTIONS } from "metabase-lib";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { NotebookStepType } from "../../../types";

/** The rows that a preview shows. */
export const SHOWN_ROW_COUNT = 10;
// Rows to run the clauses on, to pick varied rows from.
const QUERY_ROW_COUNT = 200;

/** What a focused preview runs, and which columns it shows. */
export type FocusedPreview = {
  /** The queries, whose rows show one after the other. */
  queries: Lib.Query[];
  /**
   * The columns before the results, by display name, in this order. Null
   * shows all the columns that are not results, in the order of the query.
   */
  usedNames: string[] | null;
  /** The results, by display name: the step's clauses. */
  resultNames: string[];
  /** True when the results are filters: they show as Matches or Excluded. */
  isFilter: boolean;
  /**
   * True when the rows are a varied sample of the query's rows. Summaries
   * show their first groups, which differ already.
   */
  isSampled: boolean;
};

export function hasFocusedPreview(type: NotebookStepType) {
  return type === "expression" || type === "filter" || type === "summarize";
}

/**
 * The preview of all the clauses of a custom column, filter or summarize
 * step, as the inline editor's preview showed one clause:
 * - custom columns: the table's key and the columns that they use, then the
 *   custom columns;
 * - filters: the table's key and the columns that they use, then each filter
 *   as Matches or Excluded, with rows that the filters keep and rows that
 *   they remove;
 * - summaries: the groups, the aggregations inside the expressions, then the
 *   summaries.
 * Null when the step can't have one: then it shows master's preview.
 */
export async function getFocusedPreview(
  query: Lib.Query,
  stageIndex: number,
  type: NotebookStepType,
): Promise<FocusedPreview | null> {
  try {
    switch (type) {
      case "expression":
        return getExpressionPreview(query, stageIndex);
      case "filter":
        return getFilterPreview(query, stageIndex);
      case "summarize":
        return await getSummarizePreview(query, stageIndex);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function getExpressionPreview(
  query: Lib.Query,
  stageIndex: number,
): FocusedPreview | null {
  const expressions = Lib.expressions(query, stageIndex);
  if (expressions.length === 0) {
    return null;
  }
  const resultNames = expressions.map(
    (expression) => Lib.displayInfo(query, stageIndex, expression).displayName,
  );
  const used = withPrimaryKey(
    query,
    stageIndex,
    getUsedColumnsDeep(query, stageIndex, expressions),
  );
  const previewQuery = withUsedFields(query, stageIndex, used, resultNames);
  return {
    queries: [Lib.limit(previewQuery, stageIndex, QUERY_ROW_COUNT)],
    usedNames: getNames(query, stageIndex, used),
    resultNames,
    isFilter: false,
    isSampled: true,
  };
}

function getFilterPreview(
  query: Lib.Query,
  stageIndex: number,
): FocusedPreview | null {
  const filters = Lib.filters(query, stageIndex);
  // The query before the filters: the filters come back as custom columns.
  const base = Lib.previewQuery(query, stageIndex, "expressions", null);
  if (filters.length === 0 || base == null) {
    return null;
  }

  const existingNames = new Set(
    Lib.expressions(base, stageIndex).map(
      (expression) => Lib.displayInfo(base, stageIndex, expression).displayName,
    ),
  );
  let previewQuery = base;
  const resultNames: string[] = [];
  for (const filter of filters) {
    const name = getUniqueName(
      Lib.displayInfo(query, stageIndex, filter).displayName,
      existingNames,
    );
    previewQuery = Lib.expression(
      previewQuery,
      stageIndex,
      name,
      Lib.expressionClause(Lib.expressionParts(query, stageIndex, filter)),
    );
    resultNames.push(name);
  }

  const used = withPrimaryKey(
    query,
    stageIndex,
    getUsedColumnsDeep(query, stageIndex, filters),
  );
  previewQuery = withUsedFields(previewQuery, stageIndex, used, resultNames);

  // The rows that all the filters keep, and the rows that one of them removes.
  // A rare match would not show in one sample of the table.
  const resultColumns = resultNames
    .map((name) =>
      Lib.filterableColumns(previewQuery, stageIndex).find(
        (column) =>
          Lib.displayInfo(previewQuery, stageIndex, column).displayName ===
          name,
      ),
    )
    .filter(isNotNull);
  if (resultColumns.length !== resultNames.length) {
    return null;
  }
  const kept = Lib.expressionClause(
    "and",
    resultColumns.map((column) => Lib.expressionClause("=", [column, true])),
  );
  const removed = Lib.expressionClause(
    "or",
    resultColumns.flatMap((column) => [
      Lib.expressionClause("=", [column, false]),
      Lib.expressionClause("is-null", [column]),
    ]),
  );
  const half = Math.ceil(QUERY_ROW_COUNT / 2);
  return {
    queries: [kept, removed].map((filter) =>
      Lib.limit(Lib.filter(previewQuery, stageIndex, filter), stageIndex, half),
    ),
    usedNames: getNames(query, stageIndex, used),
    resultNames,
    isFilter: true,
    isSampled: true,
  };
}

async function getSummarizePreview(
  query: Lib.Query,
  stageIndex: number,
): Promise<FocusedPreview | null> {
  const aggregations = Lib.aggregations(query, stageIndex);
  if (aggregations.length === 0) {
    return null;
  }
  const resultNames = aggregations.map(
    (aggregation) =>
      Lib.displayInfo(query, stageIndex, aggregation).displayName,
  );
  const parts = await getAggregationParts(query, stageIndex, aggregations);

  // The aggregations inside the expressions come before the summaries, as
  // columns of their own.
  let previewQuery = query;
  for (
    let current = Lib.aggregations(previewQuery, stageIndex);
    current.length > 0;
    current = Lib.aggregations(previewQuery, stageIndex)
  ) {
    previewQuery = Lib.removeClause(previewQuery, stageIndex, current[0]);
  }
  previewQuery = parts.reduce(
    (query, { parts, label }) =>
      Lib.aggregate(
        query,
        stageIndex,
        Lib.withExpressionName(Lib.expressionClause(parts), label),
      ),
    previewQuery,
  );
  previewQuery = aggregations.reduce(
    (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
    previewQuery,
  );
  return {
    queries: [Lib.limit(previewQuery, stageIndex, SHOWN_ROW_COUNT)],
    usedNames: null,
    resultNames,
    isFilter: false,
    isSampled: false,
  };
}

/**
 * The result columns in the order of the preview: the used columns, then the
 * results. Other columns, like the custom columns in a filter preview, go.
 */
export function getFocusedData(
  cols: DatasetColumn[],
  rows: RowValues[],
  { usedNames, resultNames, isFilter }: FocusedPreview,
) {
  // A name can show twice, like an aggregation inside a summary and another
  // summary: the results take the last columns with their names.
  const resultIndexes: number[] = [];
  for (const name of [...resultNames].reverse()) {
    const index = cols.findLastIndex(
      (col, index) =>
        col.display_name === name && !resultIndexes.includes(index),
    );
    if (index >= 0) {
      resultIndexes.unshift(index);
    }
  }
  const usedIndexes =
    usedNames == null
      ? cols
          .map((_, index) => index)
          .filter((index) => !resultIndexes.includes(index))
      : usedNames
          .map((name) => cols.findIndex((col) => col.display_name === name))
          .filter((index) => index >= 0 && !resultIndexes.includes(index));
  const order = [...usedIndexes, ...resultIndexes];
  const focusedCols = order.map((index) => cols[index]);
  const focusedRows = rows.map((row) => order.map((index) => row[index]));
  const resultStart = resultIndexes.length > 0 ? usedIndexes.length : undefined;

  // With more than one filter, a last column tells if the row passes all of
  // them: if it is in the step's result.
  if (!isFilter || resultIndexes.length < 2) {
    return { cols: focusedCols, rows: focusedRows, resultStart };
  }
  const totalCol: DatasetColumn = {
    ...cols[resultIndexes[0]],
    name: IN_RESULT_COLUMN,
    display_name: t`In result`,
  };
  return {
    cols: [...focusedCols, totalCol],
    rows: focusedRows.map((row) => [
      ...row,
      resultIndexes.every(
        (_, index) => row[usedIndexes.length + index] === true,
      ),
    ]),
    resultStart,
    totalIndex: focusedCols.length,
  };
}

const IN_RESULT_COLUMN = "__in_result";

/**
 * The query with only the used columns as fields. Custom columns always come
 * back. A column of a linked table (an implicit join) is not a field of the
 * stage, so a helper custom column with its name returns it. The columns of
 * explicit joins come back with their join.
 */
function withUsedFields(
  query: Lib.Query,
  stageIndex: number,
  used: Lib.ColumnMetadata[],
  resultNames: string[],
) {
  let previewQuery = query;
  const expressionNames = new Set([
    ...resultNames,
    ...Lib.expressions(query, stageIndex).map(
      (expression) =>
        Lib.displayInfo(query, stageIndex, expression).displayName,
    ),
  ]);
  for (const column of used) {
    const info = Lib.displayInfo(query, stageIndex, column);
    if (
      info.isImplicitlyJoinable &&
      !expressionNames.has(info.longDisplayName)
    ) {
      previewQuery = Lib.expression(
        previewQuery,
        stageIndex,
        info.longDisplayName,
        Lib.expressionClause(column),
      );
      expressionNames.add(info.longDisplayName);
    }
  }

  const fieldable = Lib.fieldableColumns(previewQuery, stageIndex);
  const fields = [
    ...new Set(
      used
        .map((column) =>
          Lib.findMatchingColumn(previewQuery, stageIndex, column, fieldable),
        )
        .filter(isNotNull),
    ),
  ];
  return fields.length > 0
    ? Lib.withFields(previewQuery, stageIndex, fields)
    : previewQuery;
}

/**
 * The primary key of the source table first, so that a row can be found
 * again. Not the key of a joined or linked table.
 */
function withPrimaryKey(
  query: Lib.Query,
  stageIndex: number,
  used: Lib.ColumnMetadata[],
) {
  const primaryKey = Lib.fieldableColumns(query, stageIndex).find((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return (
      Lib.isPrimaryKey(column) && !info.isFromJoin && !info.isImplicitlyJoinable
    );
  });
  if (primaryKey == null) {
    return used;
  }
  const keyName = Lib.displayInfo(
    query,
    stageIndex,
    primaryKey,
  ).longDisplayName;
  return [
    primaryKey,
    ...used.filter(
      (column) =>
        Lib.displayInfo(query, stageIndex, column).longDisplayName !== keyName,
    ),
  ];
}

function getNames(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) {
  return [
    ...new Set(
      columns.map(
        (column) => Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ),
    ),
  ];
}

function getUniqueName(name: string, names: Set<string>) {
  let unique = name;
  for (let i = 2; names.has(unique); i++) {
    unique = `${name} (${i})`;
  }
  names.add(unique);
  return unique;
}

type AggregationPart = { parts: Lib.ExpressionParts; label: string };

const AGGREGATION_OPERATORS = new Set<string>(
  Object.keys(AGGREGATION_FUNCTIONS).filter(
    (name) => !(name in EXPRESSION_FUNCTIONS),
  ),
);

/**
 * The aggregations that the summaries combine, like the two counts of
 * `CountIf(…) / Count()`. A summary that is one aggregation has none. The same
 * aggregation in two summaries shows once.
 */
async function getAggregationParts(
  query: Lib.Query,
  stageIndex: number,
  aggregations: Lib.AggregationClause[],
): Promise<AggregationPart[]> {
  const found: Lib.ExpressionParts[] = [];
  for (const aggregation of aggregations) {
    const root = Lib.expressionParts(query, stageIndex, aggregation);
    const inner: Lib.ExpressionParts[] = [];
    const visit = (node: Lib.ExpressionParts | Lib.ExpressionArg) => {
      if (!Lib.isExpressionParts(node)) {
        return;
      }
      if (AGGREGATION_OPERATORS.has(node.operator)) {
        inner.push(node);
      } else {
        node.args.forEach(visit);
      }
    };
    visit(root);
    if (inner.length > 0 && inner[0] !== root) {
      found.push(...inner);
    }
  }
  const labels = await Promise.all(
    found.map((parts) =>
      formatExpressionParts(parts, { query, stageIndex, printWidth: Infinity }),
    ),
  );
  const unique = new Map<string, Lib.ExpressionParts>();
  found.forEach((parts, index) => {
    const label = labels[index].trim();
    if (!unique.has(label)) {
      unique.set(label, parts);
    }
  });
  return [...unique].map(([label, parts]) => ({ label, parts }));
}

/**
 * The columns that the clauses use, and the columns that the custom columns
 * among them use, down to the columns of the data. A custom column comes after
 * the columns that it uses.
 */
function getUsedColumnsDeep(
  query: Lib.Query,
  stageIndex: number,
  clauses: (Lib.ExpressionClause | Lib.FilterClause)[],
) {
  const expressions = new Map(
    Lib.expressions(query, stageIndex).map((expression) => [
      Lib.displayInfo(query, stageIndex, expression).displayName,
      expression,
    ]),
  );
  const seen = new Set<string>();
  const result: Lib.ColumnMetadata[] = [];
  const visit = (clause: Lib.ExpressionClause | Lib.FilterClause) => {
    for (const column of getUsedColumns(query, stageIndex, clause)) {
      const info = Lib.displayInfo(query, stageIndex, column);
      if (seen.has(info.longDisplayName)) {
        continue;
      }
      seen.add(info.longDisplayName);
      const expression = info.isCalculated
        ? expressions.get(info.displayName)
        : undefined;
      if (expression != null) {
        visit(expression);
      }
      result.push(column);
    }
  };
  clauses.forEach(visit);
  return result;
}

function getUsedColumns(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | Lib.FilterClause,
) {
  const columns: Lib.ColumnMetadata[] = [];
  const visit = (part: Lib.ExpressionParts | Lib.ExpressionArg) => {
    if (Lib.isColumnMetadata(part)) {
      columns.push(part);
    } else if (part != null && typeof part === "object" && "args" in part) {
      part.args.forEach(visit);
    }
  };
  visit(Lib.expressionParts(query, stageIndex, clause));
  return columns;
}

/**
 * Rows that show different results: every distinct result when there are
 * few, else values from the smallest to the largest of a number, or random
 * rows with different results. The results are the columns from
 * `resultStart`.
 */
export function sampleRows(
  rows: RowValues[],
  resultStart: number | undefined,
  count: number,
) {
  if (resultStart == null || rows.length <= count) {
    return rows;
  }
  const groups = new Map<string, RowValues[]>();
  for (const row of rows) {
    const key = JSON.stringify(row.slice(resultStart));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const isOneNumber =
    rows[0].length - resultStart === 1 &&
    rows.every((row) => isNumberOrNull(row[resultStart]));
  if (groups.size > count && isOneNumber) {
    return pickSpread(rows, resultStart, count);
  }
  const picked =
    groups.size <= count
      ? pickRoundRobin([...groups.values()].map(shuffle), count)
      : shuffle([...groups.values()])
          .map((group) => shuffle(group)[0])
          .slice(0, count);
  // In the order of the query, like the order of the keys.
  return picked.sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
}

function pickRoundRobin(groups: RowValues[][], count: number) {
  const picked: RowValues[] = [];
  for (let i = 0; picked.length < count; i++) {
    const round = groups.map((group) => group[i]).filter(Boolean);
    if (round.length === 0) {
      break;
    }
    picked.push(...round);
  }
  return picked.slice(0, count);
}

/** Rows from the smallest to the largest result, and one empty result. */
function pickSpread(rows: RowValues[], resultIndex: number, count: number) {
  const empty = rows.filter((row) => row[resultIndex] == null);
  const sorted = rows
    .filter((row) => row[resultIndex] != null)
    .sort((a, b) => Number(a[resultIndex]) - Number(b[resultIndex]));
  const spreadCount = count - (empty.length > 0 ? 1 : 0);
  const step = (sorted.length - 1) / Math.max(spreadCount - 1, 1);
  const offset = Math.floor(Math.random() * Math.max(step, 1));
  const picked = Array.from(
    { length: Math.min(spreadCount, sorted.length) },
    (_, i) =>
      sorted[
        Math.min(
          Math.round(i * step) + (i === 0 ? 0 : offset),
          sorted.length - 1,
        )
      ],
  );
  return [...new Set([...picked, ...shuffle(empty).slice(0, 1)])];
}

function isNumberOrNull(value: RowValue) {
  return value == null || typeof value === "number";
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

import { formatIdentifier } from "metabase/querying/expressions/identifier";
import * as Lib from "metabase-lib";

import {
  type BlockFunction,
  getBlockFunction,
  getFormulaReferences,
  getFunctionDisplayName,
} from "./formula-blocks";
import { compileTableFormula, tableFormulaColumns } from "./table-formula";

export type FormulaSuggestion = {
  /** The calculation's name as it would appear as a result column. */
  label: string;
  /** Formula text that adds the calculation. */
  source: string;
  kind: "related" | "column" | "metric";
};

const MAX_SUGGESTIONS = 8;
const MAX_NUMERIC_COLUMNS = 3;
const MAX_CATEGORY_COLUMNS = 2;

/** Functions worth suggesting next to an existing call on the same column. */
const RELATED_FUNCTIONS: Partial<Record<BlockFunction, BlockFunction[]>> = {
  sum: ["avg", "max"],
  avg: ["sum", "min", "max"],
  min: ["max", "avg"],
  max: ["min", "avg"],
};

type Candidate = Omit<FormulaSuggestion, "label">;

function callSource(
  query: Lib.Query,
  fn: BlockFunction,
  column?: Lib.ColumnMetadata,
) {
  const columnSource = column
    ? formatIdentifier(Lib.displayInfo(query, -1, column).displayName)
    : "";
  return `${getFunctionDisplayName(fn)}(${columnSource})`;
}

function getAggregationNames(query: Lib.Query) {
  return Lib.aggregations(query, -1).map(
    (aggregation) => Lib.displayInfo(query, -1, aggregation).displayName,
  );
}

/** Calls on the same column as an existing calculation, e.g. Average next to Sum. */
function getRelatedCandidates(query: Lib.Query): Candidate[] {
  return Lib.aggregations(query, -1).flatMap((aggregation) => {
    const parts = Lib.expressionParts(query, -1, aggregation);
    if (!Lib.isExpressionParts(parts)) {
      return [];
    }
    const [arg] = parts.args;
    const fn = getBlockFunction(parts.operator);
    const related = fn ? RELATED_FUNCTIONS[fn] : undefined;
    if (!related || !Lib.isColumnMetadata(arg)) {
      return [];
    }
    return related.map((relatedFn) => ({
      source: callSource(query, relatedFn, arg),
      kind: "related" as const,
    }));
  });
}

/** Columns whose values are mostly unique per row, so grouping by them isn't useful. */
function isMostlyUnique(column: Lib.ColumnMetadata) {
  return (
    Lib.isID(column) ||
    Lib.isTitle(column) ||
    Lib.isEntityName(column) ||
    Lib.isDescription(column)
  );
}

function getColumnCandidates(query: Lib.Query): Candidate[] {
  const columns = tableFormulaColumns(query);
  const numeric = columns
    .filter((column) => Lib.isNumeric(column) && !Lib.isID(column))
    .slice(0, MAX_NUMERIC_COLUMNS);
  const categories = columns
    .filter((column) => Lib.isCategory(column) && !isMostlyUnique(column))
    .slice(0, MAX_CATEGORY_COLUMNS);
  return [
    { source: callSource(query, "count"), kind: "column" },
    ...numeric.flatMap((column) =>
      (["sum", "avg"] as const).map((fn) => ({
        source: callSource(query, fn, column),
        kind: "column" as const,
      })),
    ),
    ...categories.map((column) => ({
      source: callSource(query, "distinct", column),
      kind: "column" as const,
    })),
  ];
}

/**
 * Ready-made calculations for the current table: relatives of what's already
 * there first, then common calculations on its columns, then saved metrics.
 * Skips anything already in the summary.
 */
export function getFormulaSuggestions(query: Lib.Query): FormulaSuggestion[] {
  const existing = new Set(
    getAggregationNames(query).map((name) => name.toLowerCase()),
  );
  const candidates: Candidate[] = [
    ...getRelatedCandidates(query),
    ...getColumnCandidates(query),
    ...getFormulaReferences(query).map((reference) => ({
      source: reference.source,
      kind: "metric" as const,
    })),
  ];

  const suggestions: FormulaSuggestion[] = [];
  for (const candidate of candidates) {
    if (suggestions.length >= MAX_SUGGESTIONS) {
      break;
    }
    const { clause } = compileTableFormula(query, candidate.source);
    if (!clause) {
      continue;
    }
    const preview = Lib.aggregate(query, -1, clause);
    const label = getAggregationNames(preview).at(-1);
    if (!label || existing.has(label.toLowerCase())) {
      continue;
    }
    existing.add(label.toLowerCase());
    suggestions.push({ ...candidate, label });
  }
  return suggestions;
}

export type GroupingSuggestion = {
  label: string;
  column: Lib.ColumnMetadata;
};

const MAX_GROUPING_SUGGESTIONS = 4;

/**
 * Columns from the table itself that make good first groupings: categories,
 * then dates with their default time bucket.
 */
export function getGroupingSuggestions(query: Lib.Query): GroupingSuggestion[] {
  const columns = Lib.breakoutableColumns(query, -1).filter((column) => {
    const info = Lib.displayInfo(query, -1, column);
    return (
      !info.isFromJoin && !info.isImplicitlyJoinable && !isMostlyUnique(column)
    );
  });
  const categories = columns.filter((column) => Lib.isCategory(column));
  const dates = columns
    .filter((column) => Lib.isTemporal(column))
    .map((column) => Lib.withDefaultBucket(query, -1, column));
  return [...categories, ...dates]
    .slice(0, MAX_GROUPING_SUGGESTIONS)
    .map((column) => ({
      label: Lib.displayInfo(query, -1, column).displayName,
      column,
    }));
}

import type {
  JevAggregationPick,
  JevBreakoutPick,
  JevQuestionDisplay,
  JevTemporalUnit,
} from "metabase/api/jev-create";
import {
  type JevQuestionColumnsByKey,
  applyJevFilters,
} from "metabase/querying/jev-filters/question-utils";
import type { JevAppliedFilter } from "metabase/querying/jev-filters/types";
import * as Lib from "metabase-lib";
import type { UnsavedCard } from "metabase-types/api";

const STAGE_INDEX = -1;

export interface JevQuestionChoices {
  filters: readonly JevAppliedFilter[];
  aggregation: JevAggregationPick;
  breakout: JevBreakoutPick;
  temporalUnit: JevTemporalUnit;
  display: JevQuestionDisplay;
}

const AGGREGATION_SHORT_NAMES: Record<
  Exclude<JevAggregationPick["operator"], "rows">,
  string
> = {
  count: "count",
  sum: "sum",
  avg: "avg",
  min: "min",
  max: "max",
  distinct: "distinct",
};

function findColumn(
  query: Lib.Query,
  columnsByKey: JevQuestionColumnsByKey,
  columnKey: string | null,
  candidates: Lib.ColumnMetadata[],
): Lib.ColumnMetadata | null {
  const entry = columnKey != null ? columnsByKey.get(columnKey) : undefined;
  return entry
    ? Lib.findMatchingColumn(query, STAGE_INDEX, entry.column, candidates)
    : null;
}

export function applyJevAggregation(
  query: Lib.Query,
  columnsByKey: JevQuestionColumnsByKey,
  { operator, column_key }: JevAggregationPick,
): Lib.Query {
  if (operator === "rows") {
    return query;
  }
  const shortName = AGGREGATION_SHORT_NAMES[operator];
  const libOperator = Lib.availableAggregationOperators(
    query,
    STAGE_INDEX,
  ).find(
    (candidate) =>
      Lib.displayInfo(query, STAGE_INDEX, candidate).shortName === shortName,
  );
  if (!libOperator) {
    return query;
  }
  const { requiresColumn } = Lib.displayInfo(query, STAGE_INDEX, libOperator);
  if (!requiresColumn) {
    return Lib.aggregate(
      query,
      STAGE_INDEX,
      Lib.aggregationClause(libOperator),
    );
  }
  const column = findColumn(
    query,
    columnsByKey,
    column_key,
    Lib.aggregationOperatorColumns(libOperator),
  );
  return column
    ? Lib.aggregate(
        query,
        STAGE_INDEX,
        Lib.aggregationClause(libOperator, column),
      )
    : query;
}

function withJevTemporalUnit(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  unit: JevTemporalUnit,
): Lib.ColumnMetadata {
  if (unit === "default") {
    return column;
  }
  const bucket = Lib.availableTemporalBuckets(query, STAGE_INDEX, column).find(
    (candidate) =>
      Lib.displayInfo(query, STAGE_INDEX, candidate).shortName === unit,
  );
  return bucket ? Lib.withTemporalBucket(column, bucket) : column;
}

export function applyJevBreakout(
  query: Lib.Query,
  columnsByKey: JevQuestionColumnsByKey,
  { column_key }: JevBreakoutPick,
  unit: JevTemporalUnit,
): Lib.Query {
  const column = findColumn(
    query,
    columnsByKey,
    column_key,
    Lib.breakoutableColumns(query, STAGE_INDEX),
  );
  return column
    ? Lib.breakout(query, STAGE_INDEX, withJevTemporalUnit(query, column, unit))
    : query;
}

/** The ad-hoc query a question plan describes, on `query` (a bare table query whose columns `columnsByKey` lists). */
export function buildJevQuestionQuery(
  query: Lib.Query,
  columnsByKey: JevQuestionColumnsByKey,
  choices: JevQuestionChoices,
): Lib.Query {
  const filtered = applyJevFilters(query, columnsByKey, choices.filters);
  const aggregated = applyJevAggregation(
    filtered,
    columnsByKey,
    choices.aggregation,
  );
  return applyJevBreakout(
    aggregated,
    columnsByKey,
    choices.breakout,
    choices.temporalUnit,
  );
}

/** An unsaved card for the query builder; "auto" leaves the chart type to Metabase. */
export function getJevQuestionCard(
  query: Lib.Query,
  display: JevQuestionDisplay,
): UnsavedCard {
  return {
    dataset_query: Lib.toJsQuery(query),
    display: display === "auto" ? "table" : display,
    displayIsLocked: display !== "auto",
    visualization_settings: {},
  };
}

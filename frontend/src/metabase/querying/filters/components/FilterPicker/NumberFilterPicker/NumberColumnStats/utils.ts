import * as Lib from "metabase-lib";
import type { RowValue } from "metabase-types/api";

export const BUCKET_COUNT = 80;

const BUCKET_EXPRESSION_NAME = "prototype_stats_bucket";

export interface NumberColumnStats {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  sum: number | null;
}

interface StatsBase {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
}

/**
 * The query that the stats describe: the user's query without the filter that
 * the user edits now, cut at the filter stage, with no sort and no limit. When
 * the stage aggregates, a new stage reads its results.
 */
export function getStatsBase(
  query: Lib.Query,
  givenStageIndex: number,
  column: Lib.ColumnMetadata,
  filter: Lib.Filterable | undefined,
): StatsBase | null {
  // Some callers use -1 for the last stage. The code below compares the index
  // with the stage count, so it needs the real index.
  const stageCount = Lib.stageCount(query);
  const stageIndex =
    givenStageIndex < 0 ? stageCount + givenStageIndex : givenStageIndex;
  if (stageIndex < 0 || stageIndex >= stageCount) {
    return null;
  }

  let newQuery = query;
  const ownFilter = Lib.filters(query, stageIndex).find(
    (clause) => clause === filter,
  );
  if (ownFilter != null) {
    newQuery = Lib.removeClause(newQuery, stageIndex, ownFilter);
  }
  while (Lib.stageCount(newQuery) > stageIndex + 1) {
    const droppedQuery = Lib.dropStage(newQuery);
    if (Lib.stageCount(droppedQuery) >= Lib.stageCount(newQuery)) {
      return null;
    }
    newQuery = droppedQuery;
  }
  for (const orderBy of Lib.orderBys(newQuery, stageIndex)) {
    newQuery = Lib.removeClause(newQuery, stageIndex, orderBy);
  }
  newQuery = Lib.limit(newQuery, stageIndex, null);

  const hasSummary =
    Lib.aggregations(newQuery, stageIndex).length > 0 ||
    Lib.breakouts(newQuery, stageIndex).length > 0;
  if (!hasSummary) {
    return findStatsColumn(newQuery, stageIndex, column);
  }

  // A filter on a summarized stage can use the summary columns, which are in
  // the next stage, or the columns from before the summary.
  return (
    findStatsColumn(Lib.appendStage(newQuery), stageIndex + 1, column) ??
    findStatsColumn(removeSummary(newQuery, stageIndex), stageIndex, column)
  );
}

function findStatsColumn(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): StatsBase | null {
  const newColumn = Lib.findMatchingColumn(
    query,
    stageIndex,
    column,
    Lib.expressionableColumns(query, stageIndex),
  );
  return newColumn != null ? { query, stageIndex, column: newColumn } : null;
}

function removeSummary(query: Lib.Query, stageIndex: number): Lib.Query {
  let newQuery = query;
  for (const breakout of Lib.breakouts(newQuery, stageIndex)) {
    newQuery = Lib.removeClause(newQuery, stageIndex, breakout);
  }
  for (const aggregation of Lib.aggregations(newQuery, stageIndex)) {
    newQuery = Lib.removeClause(newQuery, stageIndex, aggregation);
  }
  return newQuery;
}

function findAggregationOperator(
  query: Lib.Query,
  stageIndex: number,
  shortName: string,
) {
  return Lib.availableAggregationOperators(query, stageIndex).find(
    (operator) =>
      Lib.displayInfo(query, stageIndex, operator).shortName === shortName,
  );
}

function aggregate(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata | null,
  shortName: string,
): Lib.Query | null {
  const operator = findAggregationOperator(query, stageIndex, shortName);
  if (operator == null) {
    return null;
  }
  if (column == null) {
    return Lib.aggregate(query, stageIndex, Lib.aggregationClause(operator));
  }
  const operatorColumn = Lib.findMatchingColumn(
    query,
    stageIndex,
    column,
    Lib.aggregationOperatorColumns(operator),
  );
  return operatorColumn != null
    ? Lib.aggregate(
        query,
        stageIndex,
        Lib.aggregationClause(operator, operatorColumn),
      )
    : null;
}

/** Count, min, max, average and sum of the column, in this order. */
export function getSummaryQuery({
  query,
  stageIndex,
  column,
}: StatsBase): Lib.Query | null {
  let newQuery: Lib.Query | null = aggregate(query, stageIndex, null, "count");
  for (const shortName of ["min", "max", "avg", "sum"]) {
    if (newQuery == null) {
      return null;
    }
    newQuery = aggregate(newQuery, stageIndex, column, shortName);
  }
  return newQuery;
}

export function parseSummaryRow(row: RowValue[]): NumberColumnStats {
  const [count, min, max, avg, sum] = row.map((value) =>
    typeof value === "number" ? value : null,
  );
  return { count: count ?? 0, min, max, avg, sum };
}

/**
 * Row counts in BUCKET_COUNT equal buckets from min to max. The bucket of a
 * value is floor((value - min) * BUCKET_COUNT / (max - min)).
 */
export function getHistogramQuery(
  { query, stageIndex, column }: StatsBase,
  min: number,
  max: number,
): Lib.Query | null {
  const bucketClause = Lib.expressionClause("floor", [
    Lib.expressionClause("/", [
      Lib.expressionClause("*", [
        Lib.expressionClause("-", [column, min]),
        BUCKET_COUNT,
      ]),
      max - min,
    ]),
  ]);
  const newQuery = Lib.expression(
    query,
    stageIndex,
    BUCKET_EXPRESSION_NAME,
    bucketClause,
  );
  const bucketColumn = Lib.breakoutableColumns(newQuery, stageIndex).find(
    (column) =>
      Lib.displayInfo(newQuery, stageIndex, column).name ===
      BUCKET_EXPRESSION_NAME,
  );
  if (bucketColumn == null) {
    return null;
  }
  return aggregate(
    Lib.breakout(newQuery, stageIndex, bucketColumn),
    stageIndex,
    null,
    "count",
  );
}

export function parseHistogramRows(rows: RowValue[][]): number[] {
  const counts = new Array(BUCKET_COUNT).fill(0);
  for (const [bucket, count] of rows) {
    if (typeof bucket === "number" && typeof count === "number") {
      // The max value is on the upper bound, so it gets bucket BUCKET_COUNT.
      const index = Math.min(Math.max(bucket, 0), BUCKET_COUNT - 1);
      counts[index] += count;
    }
  }
  return counts;
}

/**
 * Slider step: 1 for integer columns, else a power of ten close to 1/1000 of
 * the range.
 */
export function getSliderStep(min: number, max: number, isInteger: boolean) {
  if (isInteger) {
    return 1;
  }
  const rawStep = (max - min) / 1000;
  return rawStep > 0 ? 10 ** Math.floor(Math.log10(rawStep)) : 1;
}

export function roundToStep(
  value: number,
  step: number,
  round: (value: number) => number = Math.round,
) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((round(value / step) * step).toFixed(decimals));
}

/**
 * Slider and histogram bounds: the data range, with the min rounded down and
 * the max rounded up to the step. The slider moves in steps from its min, so
 * with the exact data bounds its ends could miss the smallest and the largest
 * values.
 */
export function getSliderRange(min: number, max: number, step: number) {
  const start = roundToStep(min, step, Math.floor);
  const end = roundToStep(max, step, Math.ceil);
  return { min: start, max: end > start ? end : start + step };
}

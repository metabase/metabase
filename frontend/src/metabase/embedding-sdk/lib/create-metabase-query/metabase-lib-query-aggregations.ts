import {
  isCountAggregation,
  isFieldAggregation,
  isMeasureSchema,
} from "./guards";
import type {
  Aggregable,
  AggregationClause,
  ColumnMetadata,
  MeasureMetadata,
  MetricMetadata,
  Query,
} from "./metabase-lib-query-lib";
import { Lib } from "./metabase-lib-query-lib";
import {
  STAGE_INDEX,
  findLibColumn,
  getObjectNumber,
} from "./metabase-lib-query-utils";
import type { FieldAggregationRuntime } from "./runtime-types";

export function applyAggregations(
  query: Query,
  aggregations: readonly unknown[] | undefined,
  options: { addDefaultCount?: boolean } = {},
): Query | null {
  if (!aggregations?.length) {
    return options.addDefaultCount
      ? Lib.aggregateByCount(query, STAGE_INDEX)
      : query;
  }

  let nextQuery = query;

  for (const aggregation of aggregations) {
    const aggregationClause = buildLibAggregation(nextQuery, aggregation);

    if (!aggregationClause) {
      return null;
    }

    nextQuery = Lib.aggregate(nextQuery, STAGE_INDEX, aggregationClause);
  }

  return nextQuery;
}

export function applyMetricMeasures(
  query: Query,
  measures: readonly unknown[] | undefined,
): Query | null {
  let nextQuery = query;

  for (const measure of measures ?? []) {
    const measureMetadata = findLibMeasure(nextQuery, measure);

    if (!measureMetadata) {
      return null;
    }

    nextQuery = Lib.aggregate(nextQuery, STAGE_INDEX, measureMetadata);
  }

  return nextQuery;
}

export function applyMetricAggregation(
  query: Query,
  metricId: number,
): Query | null {
  const metricMetadata = findLibMetric(query, metricId);

  return metricMetadata
    ? Lib.aggregate(query, STAGE_INDEX, metricMetadata)
    : null;
}

export const findLibMetric = (
  query: Query,
  metricId: number,
): MetricMetadata | null =>
  Lib.availableMetrics(query, STAGE_INDEX).find(
    (metricMetadata) =>
      Lib.displayInfo(query, STAGE_INDEX, metricMetadata).name ===
      `metric_${metricId}`,
  ) ?? null;

function buildLibAggregation(
  query: Query,
  aggregation: unknown,
): Aggregable | null {
  if (isCountAggregation(aggregation)) {
    return findLibAggregationClause(query, "count");
  }

  if (isFieldAggregation(aggregation)) {
    return buildLibFieldAggregation(query, aggregation);
  }

  if (isMeasureSchema(aggregation)) {
    return findLibMeasure(query, aggregation);
  }

  return null;
}

function buildLibFieldAggregation(
  query: Query,
  aggregation: FieldAggregationRuntime,
): AggregationClause | null {
  const column = findLibColumn(query, aggregation.dimension);

  if (!column) {
    return null;
  }

  return findLibAggregationClause(query, aggregation.type, column);
}

function findLibAggregationClause(
  query: Query,
  operatorName: string,
  column?: ColumnMetadata,
): AggregationClause | null {
  const operator = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (operator) =>
      Lib.displayInfo(query, STAGE_INDEX, operator).shortName === operatorName,
  );

  return operator ? Lib.aggregationClause(operator, column) : null;
}

const findLibMeasure = (
  query: Query,
  measure: unknown,
): MeasureMetadata | null =>
  Lib.availableMeasures(query, STAGE_INDEX).find(
    (availableMeasure) =>
      Lib.displayInfo(query, STAGE_INDEX, availableMeasure).name ===
      `measure_${getObjectNumber(measure, "id")}`,
  ) ?? null;

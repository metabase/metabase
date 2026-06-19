import type { TemporalUnit } from "metabase-types/api";

import {
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import type {
  Aggregable,
  AggregationClause,
  ColumnMetadata,
  ExpressionClause,
  MeasureMetadata,
  MetricMetadata,
  Query,
  SegmentMetadata,
} from "./metabase-lib-query-lib";
import { Lib } from "./metabase-lib-query-lib";
import {
  STAGE_INDEX,
  fieldHasTime,
  getFieldBaseType,
  getFieldEffectiveType,
  getFieldId,
  getObjectNumber,
  getObjectString,
} from "./metabase-lib-query-utils";
import type {
  DimensionFilterRuntime,
  FieldAggregationRuntime,
} from "./runtime-types";

type FilterBuilder = (
  query: Query,
  filter: unknown,
) => ExpressionClause | SegmentMetadata | null;

export function applyFilters(
  query: Query,
  filters: readonly unknown[] | undefined,
  buildFilter: FilterBuilder,
): Query | null {
  let nextQuery = query;

  for (const filter of filters ?? []) {
    const filterClause = buildFilter(nextQuery, filter);

    if (!filterClause) {
      return null;
    }

    nextQuery = Lib.filter(nextQuery, STAGE_INDEX, filterClause);
  }

  return nextQuery;
}

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

export function applyBreakouts(
  query: Query,
  breakouts: readonly unknown[] | undefined,
): Query | null {
  let nextQuery = query;

  for (const breakout of breakouts ?? []) {
    const column = findLibColumnForBreakout(nextQuery, breakout);

    if (!column) {
      return null;
    }

    nextQuery = Lib.breakout(nextQuery, STAGE_INDEX, column);
  }

  return nextQuery;
}

export function buildLibTableFilter(
  query: Query,
  filter: unknown,
): ExpressionClause | SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (!isDimensionFilter(filter)) {
    return null;
  }

  return buildLibFieldFilter(query, filter);
}

export function buildLibMetricDatasetFilter(
  query: Query,
  filter: unknown,
): ExpressionClause | SegmentMetadata | null {
  if (isSegmentSchema(filter)) {
    return Lib.segmentMetadata(query, filter.id);
  }

  if (isTableDimensionFilter(filter)) {
    return buildLibFieldFilter(query, filter);
  }

  return null;
}

export const findLibMetric = (
  query: Query,
  metricId: number,
): MetricMetadata | null =>
  Lib.availableMetrics(query, STAGE_INDEX).find(
    (metricMetadata) => getDisplayInfoId(query, metricMetadata) === metricId,
  ) ?? null;

function buildLibFieldFilter(
  query: Query,
  filter: DimensionFilterRuntime,
): ExpressionClause | null {
  const column = findLibColumn(query, filter.dimension);

  if (!column) {
    return null;
  }

  const values = filter.values ?? [filter.value];

  if (isUnaryOperator(filter.operator)) {
    return Lib.defaultFilterClause({
      operator: filter.operator as never,
      column,
    });
  }

  if (filter.operator === "time-interval") {
    return null;
  }

  const jsType = getObjectString(filter.dimension, "jsType");

  if (jsType === "number") {
    return Lib.numberFilterClause({
      operator: filter.operator as never,
      column,
      values: values as never,
    });
  }

  if (jsType === "boolean") {
    return Lib.booleanFilterClause({
      operator: filter.operator as never,
      column,
      values: values as never,
    });
  }

  if (jsType === "Date") {
    return Lib.specificDateFilterClause({
      operator: filter.operator as never,
      column,
      values: values.map((value) => new Date(value as string | number | Date)),
      hasTime: isTableFieldSchema(filter.dimension)
        ? fieldHasTime(filter.dimension)
        : false,
    });
  }

  return Lib.stringFilterClause({
    operator: filter.operator as never,
    column,
    values: values as string[],
    options: {},
  });
}

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
      getDisplayInfoId(query, availableMeasure) ===
      getObjectNumber(measure, "id"),
  ) ?? null;

const getDisplayInfoId = (
  query: Query,
  metadata: MeasureMetadata | MetricMetadata,
): unknown =>
  (Lib.displayInfo(query, STAGE_INDEX, metadata as never) as { id?: unknown })
    .id;

function findLibColumnForBreakout(
  query: Query,
  breakout: unknown,
): ColumnMetadata | null {
  const { dimension, options } = normalizeBreakout(breakout);
  const column = findLibColumn(query, dimension);

  if (!column) {
    return null;
  }

  if (typeof options["temporal-unit"] === "string") {
    const bucket = findTemporalBucket(
      query,
      STAGE_INDEX,
      column,
      options["temporal-unit"] as TemporalUnit,
    );

    return bucket ? Lib.withTemporalBucket(column, bucket) : null;
  }

  if (isDefaultBinningOptions(options.binning)) {
    const columnWithDefaultBinning = Lib.withDefaultBinning(
      query,
      STAGE_INDEX,
      column,
    );

    return Lib.binning(columnWithDefaultBinning)
      ? columnWithDefaultBinning
      : null;
  }

  if (options.binning != null) {
    return null;
  }

  return column;
}

const findTemporalBucket = (
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  targetUnit: TemporalUnit,
) =>
  Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === targetUnit,
  ) ?? null;

const isDefaultBinningOptions = (
  value: unknown,
): value is { strategy: "default" } =>
  typeof value === "object" &&
  value != null &&
  "strategy" in value &&
  value.strategy === "default";

function findLibColumn(query: Query, field: unknown): ColumnMetadata | null {
  const fieldId = getFieldId(field);

  if (fieldId != null) {
    const sourceFieldId = getObjectNumber(field, "sourceFieldId");

    if (sourceFieldId != null) {
      return Lib.fromLegacyColumn(query, STAGE_INDEX, {
        id: fieldId,
        name: getObjectString(field, "name") ?? String(fieldId),
        display_name:
          getObjectString(field, "displayName") ??
          getObjectString(field, "name") ??
          String(fieldId),
        source: "fields",
        fk_field_id: sourceFieldId,
        base_type: isTableFieldSchema(field)
          ? getFieldBaseType(field)
          : undefined,
        effective_type: isTableFieldSchema(field)
          ? getFieldEffectiveType(field)
          : undefined,
        field_ref: ["field", fieldId, { "source-field": sourceFieldId }],
      });
    }

    return Lib.fieldMetadata(query, fieldId);
  }

  if (typeof field !== "string") {
    return null;
  }

  return (
    Lib.filterableColumns(query, STAGE_INDEX).find(
      (column) => Lib.displayInfo(query, STAGE_INDEX, column).name === field,
    ) ?? null
  );
}

function normalizeBreakout(breakout: unknown) {
  if (typeof breakout === "string" || isTableFieldSchema(breakout)) {
    return { dimension: breakout, options: {} };
  }

  if (
    typeof breakout !== "object" ||
    breakout == null ||
    !("dimension" in breakout)
  ) {
    return { dimension: null, options: {} };
  }

  const options: Record<string, unknown> = {};

  if ("bucket" in breakout && breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if ("binning" in breakout && breakout.binning) {
    options.binning = breakout.binning;
  }

  return { dimension: breakout.dimension, options };
}

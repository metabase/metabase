import type { TemporalUnit } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

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
  normalizeBreakout,
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

export function applyMetricAggregation(
  query: Query,
  metricId: number,
): Query | null {
  const metricMetadata = findLibMetric(query, metricId);

  return metricMetadata
    ? Lib.aggregate(query, STAGE_INDEX, metricMetadata)
    : null;
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
    (metricMetadata) =>
      Lib.displayInfo(query, STAGE_INDEX, metricMetadata).name ===
      `metric_${metricId}`,
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
    return buildLibRelativeDateFilter(filter, column);
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

function buildLibRelativeDateFilter(
  filter: DimensionFilterRuntime,
  column: ColumnMetadata,
): ExpressionClause | null {
  const parts = getRelativeDateFilterParts(filter);

  if (!parts) {
    return null;
  }

  return Lib.relativeDateFilterClause({
    column,
    ...parts,
  });
}

type RelativeDateFilterParts = {
  value: number;
  unit: Lib.RelativeDateFilterUnit;
  offsetValue: number | null;
  offsetUnit: Lib.RelativeDateFilterUnit | null;
  options: Lib.RelativeDateFilterOptions;
};

function getRelativeDateFilterParts(
  filter: DimensionFilterRuntime,
): RelativeDateFilterParts | null {
  const values =
    filter.values ?? (Array.isArray(filter.value) ? filter.value : null);

  if (values) {
    const [value, unit, options, offsetValue] = values;

    return createRelativeDateFilterParts(value, unit, options, offsetValue);
  }

  if (!isObject(filter.value)) {
    return null;
  }

  return createRelativeDateFilterParts(
    filter.value.value,
    filter.value.unit,
    filter.value.options,
    filter.value.offsetValue,
    filter.value.offsetUnit,
  );
}

function createRelativeDateFilterParts(
  value: unknown,
  unit: unknown,
  options: unknown,
  offsetValue?: unknown,
  offsetUnit?: unknown,
): RelativeDateFilterParts | null {
  if (typeof value !== "number" || !isRelativeDateFilterUnit(unit)) {
    return null;
  }

  const optionsObject = isObject(options) ? options : {};

  const parsedOffsetValue =
    typeof offsetValue === "number"
      ? offsetValue
      : (getNumberOption(optionsObject, "offsetValue") ??
        getNumberOption(optionsObject, "offset-value") ??
        null);

  const optionsOffsetUnit =
    getStringOption(optionsObject, "offsetUnit") ??
    getStringOption(optionsObject, "offset-unit");

  const parsedOffsetUnit = isRelativeDateFilterUnit(offsetUnit)
    ? offsetUnit
    : isRelativeDateFilterUnit(optionsOffsetUnit)
      ? optionsOffsetUnit
      : null;

  return {
    value,
    unit,
    offsetValue: parsedOffsetValue,
    offsetUnit: parsedOffsetUnit,
    options: getRelativeDateFilterOptions(options),
  };
}

function getRelativeDateFilterOptions(
  options: unknown,
): Lib.RelativeDateFilterOptions {
  if (!isObject(options)) {
    return {};
  }

  const includeCurrent =
    getBooleanOption(options, "includeCurrent") ??
    getBooleanOption(options, "include-current");

  return includeCurrent === true ? { includeCurrent: true } : {};
}

const getBooleanOption = (
  options: Record<string, unknown>,
  key: string,
): boolean | null => (typeof options[key] === "boolean" ? options[key] : null);

const getNumberOption = (
  options: Record<string, unknown>,
  key: string,
): number | null => (typeof options[key] === "number" ? options[key] : null);

const getStringOption = (
  options: Record<string, unknown>,
  key: string,
): string | null => (typeof options[key] === "string" ? options[key] : null);

const RELATIVE_DATE_FILTER_UNITS = new Set<string>([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

const isRelativeDateFilterUnit = (
  value: unknown,
): value is Lib.RelativeDateFilterUnit =>
  typeof value === "string" && RELATIVE_DATE_FILTER_UNITS.has(value);

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

  if (options.binning != null) {
    return buildBinnedColumn(query, column, dimension, options.binning);
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

type BinningOptions =
  | { strategy: "default" }
  | { strategy: "num-bins"; "num-bins": number }
  | { strategy: "bin-width"; "bin-width": number };

function buildBinnedColumn(
  query: Query,
  column: ColumnMetadata,
  field: unknown,
  binningOptions: unknown,
): ColumnMetadata | null {
  if (!isBinningOptions(binningOptions)) {
    return null;
  }

  if (binningOptions.strategy === "default") {
    const columnWithDefaultBinning = Lib.withDefaultBinning(
      query,
      STAGE_INDEX,
      column,
    );

    return Lib.binning(columnWithDefaultBinning)
      ? columnWithDefaultBinning
      : column;
  }

  const bucket = Lib.availableBinningStrategies(
    query,
    STAGE_INDEX,
    column,
  ).find(
    (bucket) =>
      Lib.displayInfo(query, STAGE_INDEX, bucket).displayName ===
      getBinningStrategyDisplayName(binningOptions),
  );

  return bucket ? Lib.withBinning(column, bucket) : column;
}

function isBinningOptions(value: unknown): value is BinningOptions {
  if (typeof value !== "object" || value == null || !("strategy" in value)) {
    return false;
  }

  if (value.strategy === "default") {
    return true;
  }

  if (value.strategy === "num-bins") {
    return getObjectNumber(value, "num-bins") != null;
  }

  return (
    value.strategy === "bin-width" &&
    getObjectNumber(value, "bin-width") != null
  );
}

function getBinningStrategyDisplayName(
  binningOptions: Exclude<BinningOptions, { strategy: "default" }>,
) {
  if (binningOptions.strategy === "num-bins") {
    return `${binningOptions["num-bins"]} bins`;
  }

  return `Bin every ${binningOptions["bin-width"]}`;
}

function findLibColumn(
  query: Query,
  field: unknown,
  options: Record<string, unknown> = {},
): ColumnMetadata | null {
  const fieldId = getFieldId(field);

  if (fieldId != null) {
    const sourceFieldId = getObjectNumber(field, "sourceFieldId");
    const fieldOptions =
      sourceFieldId == null
        ? options
        : { ...options, "source-field": sourceFieldId };

    if (Object.keys(fieldOptions).length > 0) {
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
        field_ref: ["field", fieldId, fieldOptions],
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

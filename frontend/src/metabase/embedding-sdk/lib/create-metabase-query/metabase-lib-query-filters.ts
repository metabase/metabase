import { isObject } from "metabase-types/guards";

import {
  isDimensionFilter,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
  isUnaryOperator,
} from "./guards";
import type {
  ColumnMetadata,
  ExpressionClause,
  Query,
  SegmentMetadata,
} from "./metabase-lib-query-lib";
import { Lib } from "./metabase-lib-query-lib";
import {
  STAGE_INDEX,
  fieldHasTime,
  findLibColumn,
  getObjectString,
} from "./metabase-lib-query-utils";
import type { DimensionFilterRuntime } from "./runtime-types";

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

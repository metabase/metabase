import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  FieldSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isNumber } from "metabase/utils/types";
import type { OrderByDirection } from "metabase-lib";
import { isObject } from "metabase-types/guards";

import type {
  BreakoutInput,
  ColumnReferenceInput,
  MetricQueryInput,
  MetricReference,
  TableQueryInput,
} from "./input-types";

type MetricDimensionGroup = NonNullable<MetricReference["dimensions"]>[string];

type MetricDimensions = Record<string, FieldSchema | MetricDimensionGroup>;

type MetricWithDimensions = {
  dimensions: MetricDimensions;
};

export const getTableFromInput = (input: TableQueryInput): TableSchema | null =>
  isObject(input.table) ? (input.table as TableSchema) : null;

export const isMetricQueryInput = (
  input: TableQueryInput | MetricQueryInput,
): input is MetricQueryInput => "metric" in input || "metricId" in input;

export function getFieldId(field: unknown): number | null {
  if (hasFieldId(field)) {
    return field.fieldId;
  }

  if (isTableFieldSchema(field) && typeof field.id === "number") {
    return field.id;
  }

  return null;
}

export const hasFieldId = (
  value: unknown,
): value is FieldSchema & { fieldId: number } =>
  isObject(value) && "fieldId" in value && isNumber(value.fieldId);

export const isMetricDimensionWithFieldId = (
  value: unknown,
): value is FieldSchema & { fieldId: number } =>
  isTableFieldSchema(value) && hasFieldId(value);

export const isColumnReference = (
  value: unknown,
): value is ColumnReferenceInput =>
  typeof value === "string" || isTableFieldSchema(value);

export function getMetricDimensionValues<TDimension>(
  metric: unknown,
  isDimension: (value: unknown) => value is TDimension,
): TDimension[] {
  if (!hasMetricDimensions(metric)) {
    return [];
  }

  return Object.values(metric.dimensions).flatMap((dimensionOrGroup) => {
    if (isDimension(dimensionOrGroup)) {
      return [dimensionOrGroup];
    }

    return isObject(dimensionOrGroup)
      ? Object.values(dimensionOrGroup).filter(isDimension)
      : [];
  });
}

const hasMetricDimensions = (value: unknown): value is MetricWithDimensions =>
  isObject(value) && isObject(value.dimensions);

export const normalizeBreakout = (
  breakout: BreakoutInput | unknown,
): {
  dimension: ColumnReferenceInput | null;
  options: Record<string, unknown>;
} => ({
  dimension: getBreakoutDimension(breakout),
  options: getBreakoutOptions(breakout),
});

function getBreakoutDimension(
  breakout: BreakoutInput | unknown,
): ColumnReferenceInput | null {
  if (typeof breakout === "string" || isTableFieldSchema(breakout)) {
    return breakout;
  }

  if (
    isObject(breakout) &&
    "dimension" in breakout &&
    isColumnReference(breakout.dimension)
  ) {
    return breakout.dimension;
  }

  return null;
}

export const normalizeSort = (
  sort: unknown,
): { column: unknown; direction: OrderByDirection } => {
  if (isObject(sort) && "column" in sort) {
    return {
      column: sort.column,
      direction: normalizeSortDirection(sort.direction),
    };
  }

  return { column: sort, direction: "asc" };
};

const normalizeSortDirection = (direction: unknown): OrderByDirection =>
  direction === "desc" ? "desc" : "asc";

function getBreakoutOptions(breakout: unknown): Record<string, unknown> {
  if (!isObject(breakout)) {
    return {};
  }

  const options: Record<string, unknown> = {};

  if ("bucket" in breakout && breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if ("binning" in breakout && breakout.binning) {
    options.binning = breakout.binning;
  }

  return options;
}

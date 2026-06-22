import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type {
  FieldSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isNumber } from "metabase/utils/types";
import { isObject } from "metabase-types/guards";

import type {
  BreakoutInput,
  ColumnReferenceInput,
  MetricQueryInput,
  TableQueryInput,
} from "./input-types";

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
  const dimensions = getObject(metric, "dimensions");

  if (!dimensions) {
    return [];
  }

  return Object.values(dimensions).flatMap((dimensionOrGroup) => {
    if (isDimension(dimensionOrGroup)) {
      return [dimensionOrGroup];
    }

    return isObject(dimensionOrGroup)
      ? Object.values(dimensionOrGroup).filter(isDimension)
      : [];
  });
}

export function getObject(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const property = getObjectProperty(value, key);

  return isObject(property) ? property : null;
}

const getObjectProperty = (value: unknown, key: string): unknown =>
  isObject(value) && key in value ? value[key] : undefined;

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

import type {
  FieldSchema,
  SchemaJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isNumber } from "metabase/utils/types";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isObject } from "metabase-types/guards";

import { isTableFieldSchema } from "./guards";
import type { BreakoutRuntime, ColumnReferenceRuntime } from "./runtime-types";

export const STAGE_INDEX = 0;

const JAVASCRIPT_TYPE_BASE_TYPES: Partial<
  Record<SchemaJavaScriptType, string>
> = {
  number: TYPE.Float,
  boolean: TYPE.Boolean,
  Date: TYPE.DateTime,
};

export const getBaseType = (jsType?: SchemaJavaScriptType): string =>
  jsType != null && jsType in JAVASCRIPT_TYPE_BASE_TYPES
    ? (JAVASCRIPT_TYPE_BASE_TYPES[jsType as SchemaJavaScriptType] ?? TYPE.Text)
    : TYPE.Text;

export const getFieldBaseType = (field: FieldSchema): string =>
  field.baseType ?? getBaseType(field.jsType);

export const getFieldEffectiveType = (field: FieldSchema): string =>
  field.effectiveType ?? getFieldBaseType(field);

export function fieldHasTime(field: FieldSchema): boolean {
  const schemaType = field.effectiveType ?? field.baseType;

  return typeof schemaType === "string" && schemaType.includes(TYPE.DateTime);
}

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
): value is ColumnReferenceRuntime =>
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
  breakout: BreakoutRuntime | unknown,
): {
  dimension: ColumnReferenceRuntime | null;
  options: Record<string, unknown>;
} => ({
  dimension: getBreakoutDimension(breakout),
  options: getBreakoutOptions(breakout),
});

function getBreakoutDimension(
  breakout: BreakoutRuntime | unknown,
): ColumnReferenceRuntime | null {
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

export function findLibColumn(
  query: Query,
  field: ColumnReferenceRuntime,
  options: Record<string, unknown> = {},
): ColumnMetadata | null {
  if (typeof field === "string") {
    return (
      Lib.filterableColumns(query, STAGE_INDEX).find(
        (column) => Lib.displayInfo(query, STAGE_INDEX, column).name === field,
      ) ?? null
    );
  }

  const fieldId = getFieldId(field);
  if (fieldId != null) {
    const sourceFieldId = field.sourceFieldId;
    const fieldOptions =
      sourceFieldId == null
        ? options
        : { ...options, "source-field": sourceFieldId };

    if (Object.keys(fieldOptions).length > 0) {
      return Lib.fromLegacyColumn(query, STAGE_INDEX, {
        id: fieldId,
        name: field.name,
        display_name: field.displayName ?? field.name,
        source: "fields",
        fk_field_id: sourceFieldId,
        base_type: getFieldBaseType(field),
        effective_type: getFieldEffectiveType(field),
        field_ref: ["field", fieldId, fieldOptions],
      });
    }

    return Lib.fieldMetadata(query, fieldId);
  }

  return null;
}

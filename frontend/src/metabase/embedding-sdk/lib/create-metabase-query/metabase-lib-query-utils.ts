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

export const STAGE_INDEX = 0;

const JAVASCRIPT_TYPE_BASE_TYPES = {
  number: TYPE.Float,
  boolean: TYPE.Boolean,
  Date: TYPE.DateTime,
} satisfies Partial<Record<SchemaJavaScriptType, string>>;

export const getBaseType = (jsType: unknown): string =>
  getObjectString(JAVASCRIPT_TYPE_BASE_TYPES, String(jsType)) ?? TYPE.Text;

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

export function getObjectNumber(
  value: unknown,
  key: string,
): number | undefined {
  const property = getObjectProperty(value, key);

  return isNumber(property) ? property : undefined;
}

export function getObjectString(
  value: unknown,
  key: string,
): string | undefined {
  const property = getObjectProperty(value, key);

  return typeof property === "string" ? property : undefined;
}

const getObjectProperty = (value: unknown, key: string): unknown =>
  isObject(value) && key in value ? value[key] : undefined;

export const normalizeBreakout = (breakout: unknown) => ({
  dimension: getBreakoutDimension(breakout),
  options: getBreakoutOptions(breakout),
});

function getBreakoutDimension(breakout: unknown) {
  if (typeof breakout === "string" || isTableFieldSchema(breakout)) {
    return breakout;
  }

  return isObject(breakout) && "dimension" in breakout
    ? breakout.dimension
    : null;
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

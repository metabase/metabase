import type { FieldSchema } from "../data-schema";

import { isTableFieldSchema } from "./guards";

export const STAGE_INDEX = 0;

export type FieldWithFieldId = FieldSchema;

export function getBaseType(jsType: unknown): string {
  switch (jsType) {
    case "number":
      return "type/Float";
    case "boolean":
      return "type/Boolean";
    case "Date":
      return "type/DateTime";
    default:
      return "type/Text";
  }
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

export function hasFieldId(
  value: unknown,
): value is FieldSchema & { fieldId: number } {
  return (
    typeof value === "object" &&
    value != null &&
    "fieldId" in value &&
    typeof value.fieldId === "number"
  );
}

export function isMetricDimensionWithFieldId(
  value: unknown,
): value is FieldSchema & { fieldId: number } {
  return isTableFieldSchema(value) && typeof value.fieldId === "number";
}

export function getObject(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "object" && property != null
    ? (property as Record<string, unknown>)
    : null;
}

export function getObjectNumber(
  value: unknown,
  key: string,
): number | undefined {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "number" ? property : undefined;
}

export function getObjectString(
  value: unknown,
  key: string,
): string | undefined {
  if (typeof value !== "object" || value == null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];

  return typeof property === "string" ? property : undefined;
}

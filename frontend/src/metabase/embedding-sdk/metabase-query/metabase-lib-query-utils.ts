import { match } from "ts-pattern";

import { isTableFieldSchema } from "./guards";
import type { FieldSchema } from "./schema";

export const STAGE_INDEX = 0;

export type FieldWithFieldId = FieldSchema;

export const getBaseType = (jsType: unknown): string =>
  match(jsType)
    .with("number", () => "type/Float")
    .with("boolean", () => "type/Boolean")
    .with("Date", () => "type/DateTime")
    .otherwise(() => "type/Text");

export const getFieldBaseType = (field: FieldSchema): string =>
  field.baseType ?? getBaseType(field.jsType);

export const getFieldEffectiveType = (field: FieldSchema): string =>
  field.effectiveType ?? getFieldBaseType(field);

export function fieldHasTime(field: FieldSchema): boolean {
  const schemaType = field.effectiveType ?? field.baseType;

  return typeof schemaType === "string" && schemaType.includes("DateTime");
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
  typeof value === "object" &&
  value != null &&
  "fieldId" in value &&
  typeof value.fieldId === "number";

export const isMetricDimensionWithFieldId = (
  value: unknown,
): value is FieldSchema & { fieldId: number } =>
  isTableFieldSchema(value) && typeof value.fieldId === "number";

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

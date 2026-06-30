import { isObject } from "metabase-types/guards";

import type { FieldSchema, TableSchema } from "./schema";

export type TableInput = { source?: TableSchema };

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  value.type === "table" &&
  typeof value.databaseId === "number";

export function isTableFieldSchema(value: unknown): value is FieldSchema {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    (typeof value.fieldId === "number" ||
      typeof value.id === "number" ||
      typeof value.id === "string")
  );
}

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";

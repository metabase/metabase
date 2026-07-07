import { isObject } from "metabase-types/guards";

import type { TableSchema } from "./schema";

export type TableInput = { source?: TableSchema };

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  value.type === "table" &&
  typeof value.databaseId === "number";

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";

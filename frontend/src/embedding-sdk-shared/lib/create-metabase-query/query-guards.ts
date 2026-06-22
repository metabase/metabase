import { isObject } from "metabase-types/guards";

import type { FieldSchema, TableSchema } from "./schema";

export type QuestionQueryLike = {
  questionId: unknown;
  parameters?: unknown;
};

export type TableQueryLike = {
  table?: unknown;
  tableId?: unknown;
  databaseId?: unknown;
};

export type MetricQueryLike = {
  metric?: unknown;
  metricId?: unknown;
};

export const isQuestionQuery = (query: unknown): query is QuestionQueryLike =>
  isObject(query) && "questionId" in query && query.questionId != null;

export const isTableQuery = (query: unknown): query is TableQueryLike =>
  isObject(query) &&
  (("table" in query && query.table != null) ||
    ("tableId" in query && query.tableId != null));

export const isMetricQuery = (query: unknown): query is MetricQueryLike =>
  isObject(query) &&
  (("metric" in query && isMetricReference(query.metric)) ||
    ("metricId" in query && query.metricId != null));

export const isMetricReference = (
  value: unknown,
): value is {
  id: string | number;
  databaseId?: string | number;
  sourceTableId?: string | number;
  sourceCardId?: string | number;
  mappedTableIds: readonly number[];
} =>
  isObject(value) &&
  "id" in value &&
  "mappedTableIds" in value &&
  Array.isArray(value.mappedTableIds);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) && "id" in value && "databaseId" in value;

export function isTableFieldSchema(value: unknown): value is FieldSchema {
  if (!isObject(value) || "metricId" in value) {
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

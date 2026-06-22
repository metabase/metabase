import { isObject } from "metabase-types/guards";

import type { FieldSchema, MetricSchema, TableSchema } from "./schema";

type ID = string | number;

export type MetricReferenceLike = Pick<MetricSchema, "dimensions"> & {
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds: readonly number[];
  columns?: MetricSchema["columns"];
};

export type QuestionQueryLike = {
  questionId: ID;
  parameters?: unknown;
};

export type TableQueryLike = {
  table?: TableSchema;
};

export type MetricQueryLike = {
  metric?: MetricReferenceLike;
  metricId?: number;
};

export const isQuestionQuery = (query: unknown): query is QuestionQueryLike =>
  isObject(query) && "questionId" in query && isId(query.questionId);

export const isTableQuery = (query: unknown): query is TableQueryLike =>
  isObject(query) && "table" in query && isTableReference(query.table);

export const isMetricQuery = (query: unknown): query is MetricQueryLike =>
  isObject(query) &&
  (("metric" in query && isMetricReference(query.metric)) ||
    ("metricId" in query && typeof query.metricId === "number"));

export const isMetricReference = (
  value: unknown,
): value is MetricReferenceLike =>
  isObject(value) &&
  isId(value.id) &&
  "mappedTableIds" in value &&
  Array.isArray(value.mappedTableIds) &&
  value.mappedTableIds.every((id) => typeof id === "number");

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  typeof value.databaseId === "number";

export const isId = (value: unknown): value is ID =>
  typeof value === "string" || typeof value === "number";

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

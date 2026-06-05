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

export type QuestionInput = { questionId: ID; parameters?: unknown };
export type TableInput = { table?: TableSchema };
export type MetricInput = { metric?: MetricReferenceLike; metricId?: number };

export const isQuestionInput = (input: unknown): input is QuestionInput =>
  isObject(input) && "questionId" in input && isId(input.questionId);

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "table" in input && isTableReference(input.table);

export const isMetricInput = (input: unknown): input is MetricInput =>
  isObject(input) &&
  (("metric" in input && isMetricReference(input.metric)) ||
    ("metricId" in input && typeof input.metricId === "number"));

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

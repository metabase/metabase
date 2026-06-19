import type { TableSchema } from "../data-schema";

import type {
  ID,
  MetabaseQueryRuntime,
  MetricQueryRuntime,
  MetricReferenceRuntime,
  QuestionQueryRuntime,
  TableQueryRuntime,
} from "./runtime-types";

export const isQuestionQuery = (
  query: MetabaseQueryRuntime,
): query is QuestionQueryRuntime => query.questionId != null;

export const isTableQuery = (
  query: MetabaseQueryRuntime,
): query is TableQueryRuntime => getTableId(query) != null;

export const isMetricQuery = (
  query: MetabaseQueryRuntime,
): query is MetricQueryRuntime => getMetricId(query) != null;

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";

function getMetricId(query: unknown): ID | null {
  if (typeof query !== "object" || query == null) {
    return null;
  }

  if ("metricId" in query && query.metricId != null) {
    return query.metricId as ID;
  }

  if ("metric" in query && isMetricReference(query.metric)) {
    return query.metric.id;
  }

  return null;
}

function getTableId(query: unknown): ID | null {
  if (typeof query !== "object" || query == null) {
    return null;
  }

  if ("table" in query && isTableReference(query.table)) {
    return query.table.id;
  }

  if ("tableId" in query && query.tableId != null) {
    return query.tableId as ID;
  }

  return null;
}

const isMetricReference = (value: unknown): value is MetricReferenceRuntime =>
  typeof value === "object" &&
  value != null &&
  "id" in value &&
  "mappedTableIds" in value &&
  Array.isArray(value.mappedTableIds);

const isTableReference = (value: unknown): value is TableSchema =>
  typeof value === "object" &&
  value != null &&
  "id" in value &&
  "databaseId" in value;

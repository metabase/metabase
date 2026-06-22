import type { FieldSchema, TableSchema } from "../data-schema";

import type {
  CountAggregationRuntime,
  DimensionFilterRuntime,
  FieldAggregationRuntime,
  ID,
  MeasureReferenceRuntime,
  MetabaseQueryRuntime,
  MetricQueryRuntime,
  MetricReferenceRuntime,
  QuestionQueryRuntime,
  SegmentReferenceRuntime,
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

export const isNotNull = <TValue>(value: TValue | null): value is TValue =>
  value !== null;

export function getMetricId(query: unknown): ID | null {
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

export function getTableId(query: unknown): ID | null {
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

export function getTableDatabaseId(query: TableQueryRuntime): ID | null {
  if ("table" in query && isTableReference(query.table)) {
    return query.table.databaseId;
  }

  if ("databaseId" in query && query.databaseId != null) {
    return query.databaseId;
  }

  return null;
}

export const getMetricMappedTableIds = (
  query: MetricQueryRuntime,
): readonly number[] | null =>
  isMetricReference(query.metric) ? query.metric.mappedTableIds : null;

export const getMetricDatabaseId = (query: MetricQueryRuntime): ID | null =>
  isMetricReference(query.metric) && query.metric.databaseId != null
    ? query.metric.databaseId
    : null;

export const getMetricSourceTableId = (query: MetricQueryRuntime): ID | null =>
  isMetricReference(query.metric) && query.metric.sourceTableId != null
    ? query.metric.sourceTableId
    : null;

export const getMetricSourceCardId = (query: MetricQueryRuntime): ID | null =>
  isMetricReference(query.metric) && query.metric.sourceCardId != null
    ? query.metric.sourceCardId
    : null;

export const isDimensionFilter = (
  value: unknown,
): value is DimensionFilterRuntime =>
  typeof value === "object" && value != null && "dimension" in value;

export const isTableDimensionFilter = (
  value: unknown,
): value is DimensionFilterRuntime & { dimension: FieldSchema } =>
  isDimensionFilter(value) && isTableFieldSchema(value.dimension);

export const isSegmentSchema = (
  value: unknown,
): value is SegmentReferenceRuntime =>
  typeof value === "object" &&
  value != null &&
  "kind" in value &&
  value.kind === "segment";

export const isMeasureSchema = (
  value: unknown,
): value is MeasureReferenceRuntime =>
  typeof value === "object" &&
  value != null &&
  "kind" in value &&
  value.kind === "measure";

export const isCountAggregation = (
  value: unknown,
): value is CountAggregationRuntime =>
  typeof value === "object" &&
  value != null &&
  "type" in value &&
  value.type === "count";

export const isFieldAggregation = (
  value: unknown,
): value is FieldAggregationRuntime =>
  typeof value === "object" &&
  value != null &&
  "type" in value &&
  "dimension" in value &&
  (value.type === "sum" ||
    value.type === "avg" ||
    value.type === "median" ||
    value.type === "distinct" ||
    value.type === "min" ||
    value.type === "max");

export const isMetricReference = (
  value: unknown,
): value is MetricReferenceRuntime =>
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

export const isFieldSchema = (value: unknown): value is FieldSchema =>
  isTableFieldSchema(value);

export const isTableFieldSchema = (value: unknown): value is FieldSchema => {
  if (typeof value !== "object" || value == null || "metricId" in value) {
    return false;
  }

  const field = value as Record<string, unknown>;

  return (
    typeof field.name === "string" &&
    (typeof field.fieldId === "number" ||
      typeof field.id === "number" ||
      typeof field.id === "string")
  );
};

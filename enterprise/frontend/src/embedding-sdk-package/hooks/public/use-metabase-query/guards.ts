import type {
  FieldSchema,
  MetricDimensionSchema,
  TableSchema,
} from "../data-schema";

import type {
  CountAggregationRuntime,
  DimensionFilterRuntime,
  FieldAggregationRuntime,
  ID,
  MeasureReferenceRuntime,
  MetabaseQueryRuntime,
  MetricDimensionFilterRuntime,
  MetricQueryRuntime,
  MetricReferenceRuntime,
  QuestionQueryRuntime,
  SegmentReferenceRuntime,
  TableQueryRuntime,
} from "./runtime-types";

export function isQuestionQuery(
  query: MetabaseQueryRuntime,
): query is QuestionQueryRuntime {
  return query.questionId != null;
}

export function isTableQuery(
  query: MetabaseQueryRuntime,
): query is TableQueryRuntime {
  return getTableId(query) != null;
}

export function isMetricQuery(
  query: MetabaseQueryRuntime,
): query is MetricQueryRuntime {
  return getMetricId(query) != null;
}

export function isUnaryOperator(operator: string) {
  return (
    operator === "is-empty" ||
    operator === "not-empty" ||
    operator === "is-null" ||
    operator === "not-null"
  );
}

export function isNotNull<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}

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

export function getMetricMappedTableIds(
  query: MetricQueryRuntime,
): readonly number[] | null {
  return isMetricReference(query.metric) ? query.metric.mappedTableIds : null;
}

export function getMetricDatabaseId(query: MetricQueryRuntime): ID | null {
  return isMetricReference(query.metric) && query.metric.databaseId != null
    ? query.metric.databaseId
    : null;
}

export function getMetricSourceTableId(query: MetricQueryRuntime): ID | null {
  return isMetricReference(query.metric) && query.metric.sourceTableId != null
    ? query.metric.sourceTableId
    : null;
}

export function isDimensionFilter(
  value: unknown,
): value is DimensionFilterRuntime {
  return typeof value === "object" && value != null && "dimension" in value;
}

export function isMetricDimensionFilter(
  value: unknown,
): value is MetricDimensionFilterRuntime {
  return isDimensionFilter(value) && isMetricDimensionSchema(value.dimension);
}

export function isTableDimensionFilter(
  value: unknown,
): value is DimensionFilterRuntime & { dimension: FieldSchema } {
  return isDimensionFilter(value) && isTableFieldSchema(value.dimension);
}

export function isSegmentSchema(
  value: unknown,
): value is SegmentReferenceRuntime {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    value.kind === "segment"
  );
}

export function isMeasureSchema(
  value: unknown,
): value is MeasureReferenceRuntime {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    value.kind === "measure"
  );
}

export function isCountAggregation(
  value: unknown,
): value is CountAggregationRuntime {
  return (
    typeof value === "object" &&
    value != null &&
    "type" in value &&
    value.type === "count"
  );
}

export function isFieldAggregation(
  value: unknown,
): value is FieldAggregationRuntime {
  return (
    typeof value === "object" &&
    value != null &&
    "type" in value &&
    "dimension" in value &&
    (value.type === "sum" ||
      value.type === "avg" ||
      value.type === "median" ||
      value.type === "distinct" ||
      value.type === "min" ||
      value.type === "max")
  );
}

export function isMetricReference(
  value: unknown,
): value is MetricReferenceRuntime {
  return (
    typeof value === "object" &&
    value != null &&
    "id" in value &&
    "mappedTableIds" in value &&
    Array.isArray(value.mappedTableIds)
  );
}

function isTableReference(value: unknown): value is TableSchema {
  return (
    typeof value === "object" &&
    value != null &&
    "id" in value &&
    "databaseId" in value
  );
}

export function isFieldSchema(
  value: unknown,
): value is FieldSchema | MetricDimensionSchema {
  return isTableFieldSchema(value) || isMetricDimensionSchema(value);
}

export function isTableFieldSchema(value: unknown): value is FieldSchema {
  return (
    typeof value === "object" &&
    value != null &&
    !("metricId" in value) &&
    ("fieldId" in value || "id" in value)
  );
}

export function isMetricDimensionSchema(
  value: unknown,
): value is MetricDimensionSchema {
  return (
    typeof value === "object" &&
    value != null &&
    "metricId" in value &&
    "id" in value
  );
}

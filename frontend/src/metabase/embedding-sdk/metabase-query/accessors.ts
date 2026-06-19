import type {
  ID,
  MetricQueryRuntime,
  MetricReferenceRuntime,
  TableQueryRuntime,
} from "./runtime-types";
import type { TableSchema } from "./schema";

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

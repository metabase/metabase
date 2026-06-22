import { isMetricReference } from "embedding-sdk-shared/lib/create-metabase-query/query-guards";
import type { TableSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type {
  ID,
  MetricQueryRuntime,
  TableQueryRuntime,
} from "./runtime-types";

export function getMetricIdFromQuery(query: unknown): ID | null {
  if (!isObject(query)) {
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

export function getTableIdFromQuery(query: unknown): ID | null {
  if (!isObject(query)) {
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

export function getTableDatabaseIdFromQuery(
  query: TableQueryRuntime,
): ID | null {
  if ("table" in query && isTableReference(query.table)) {
    return query.table.databaseId;
  }

  if ("databaseId" in query && query.databaseId != null) {
    return query.databaseId;
  }

  return null;
}

export const getMetricMappedTableIdsFromQuery = (
  query: MetricQueryRuntime,
): readonly number[] | null =>
  isMetricReference(query.metric) ? query.metric.mappedTableIds : null;

export const getMetricDatabaseIdFromQuery = (
  query: MetricQueryRuntime,
): ID | null =>
  isMetricReference(query.metric) && query.metric.databaseId != null
    ? query.metric.databaseId
    : null;

export const getMetricSourceTableIdFromQuery = (
  query: MetricQueryRuntime,
): ID | null =>
  isMetricReference(query.metric) && query.metric.sourceTableId != null
    ? query.metric.sourceTableId
    : null;

export const getMetricSourceCardIdFromQuery = (
  query: MetricQueryRuntime,
): ID | null =>
  isMetricReference(query.metric) && query.metric.sourceCardId != null
    ? query.metric.sourceCardId
    : null;

export const getMetricSourceIdFromQuery = (
  query: MetricQueryRuntime,
): TableId | null => {
  const sourceTableId = getMetricSourceTableIdFromQuery(query);

  if (sourceTableId != null) {
    return Number(sourceTableId);
  }

  const sourceCardId = getMetricSourceCardIdFromQuery(query);

  return sourceCardId == null ? null : `card__${sourceCardId}`;
};

const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) && "id" in value && "databaseId" in value;

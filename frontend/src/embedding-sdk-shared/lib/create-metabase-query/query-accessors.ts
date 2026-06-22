import type { TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type ID,
  type MetricQueryLike,
  type TableQueryLike,
  isId,
  isMetricReference,
  isTableReference,
} from "./query-guards";

export type { ID };

export function getMetricIdFromQuery(query: unknown): number | null {
  if (!isObject(query)) {
    return null;
  }

  if ("metricId" in query && typeof query.metricId === "number") {
    return query.metricId;
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

  if ("tableId" in query && isId(query.tableId)) {
    return query.tableId;
  }

  return null;
}

export function getTableDatabaseIdFromQuery(
  query: TableQueryLike,
): number | null {
  if ("table" in query && isTableReference(query.table)) {
    return query.table.databaseId;
  }

  if ("databaseId" in query && typeof query.databaseId === "number") {
    return query.databaseId;
  }

  return null;
}

export const getMetricMappedTableIdsFromQuery = (
  query: MetricQueryLike,
): readonly number[] | null =>
  isMetricReference(query.metric) ? query.metric.mappedTableIds : null;

export const getMetricDatabaseIdFromQuery = (
  query: MetricQueryLike,
): number | null =>
  isMetricReference(query.metric) && query.metric.databaseId != null
    ? query.metric.databaseId
    : null;

export const getMetricSourceTableIdFromQuery = (
  query: MetricQueryLike,
): number | null =>
  isMetricReference(query.metric) && query.metric.sourceTableId != null
    ? query.metric.sourceTableId
    : null;

export const getMetricSourceCardIdFromQuery = (
  query: MetricQueryLike,
): number | null =>
  isMetricReference(query.metric) && query.metric.sourceCardId != null
    ? query.metric.sourceCardId
    : null;

export const getMetricSourceIdFromQuery = (
  query: MetricQueryLike,
): TableId | null => {
  const sourceTableId = getMetricSourceTableIdFromQuery(query);

  if (sourceTableId != null) {
    return Number(sourceTableId);
  }

  const sourceCardId = getMetricSourceCardIdFromQuery(query);

  return sourceCardId == null ? null : `card__${sourceCardId}`;
};

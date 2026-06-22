import type { TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type MetricQueryLike,
  type TableQueryLike,
  isMetricReference,
  isTableReference,
} from "./query-guards";

export type ID = string | number;

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

export function getTableDatabaseIdFromQuery(query: TableQueryLike): ID | null {
  if ("table" in query && isTableReference(query.table)) {
    return query.table.databaseId;
  }

  if ("databaseId" in query && query.databaseId != null) {
    return query.databaseId as ID;
  }

  return null;
}

export const getMetricMappedTableIdsFromQuery = (
  query: MetricQueryLike,
): readonly number[] | null =>
  isMetricReference(query.metric) ? query.metric.mappedTableIds : null;

export const getMetricDatabaseIdFromQuery = (
  query: MetricQueryLike,
): ID | null =>
  isMetricReference(query.metric) && query.metric.databaseId != null
    ? query.metric.databaseId
    : null;

export const getMetricSourceTableIdFromQuery = (
  query: MetricQueryLike,
): ID | null =>
  isMetricReference(query.metric) && query.metric.sourceTableId != null
    ? query.metric.sourceTableId
    : null;

export const getMetricSourceCardIdFromQuery = (
  query: MetricQueryLike,
): ID | null =>
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

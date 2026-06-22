import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type MetricInput,
  type TableInput,
  isMetricReference,
  isTableReference,
} from "./input-guards";

type ID = string | number;

export function getMetricIdFromInput(input: unknown): number | null {
  if (!isObject(input)) {
    return null;
  }

  if ("metricId" in input && typeof input.metricId === "number") {
    return input.metricId;
  }

  if ("metric" in input && isMetricReference(input.metric)) {
    return input.metric.id;
  }

  return null;
}

export function getTableIdFromInput(input: unknown): ID | null {
  if (!isObject(input)) {
    return null;
  }

  if ("table" in input && isTableReference(input.table)) {
    return input.table.id;
  }

  return null;
}

export function getTableDatabaseIdFromInput(input: TableInput): number | null {
  if ("table" in input && isTableReference(input.table)) {
    return input.table.databaseId;
  }

  return null;
}

export const getMetricMappedTableIdsFromInput = (
  input: MetricInput,
): readonly number[] | null =>
  isMetricReference(input.metric) ? input.metric.mappedTableIds : null;

export const getMetricDatabaseIdFromInput = (
  input: MetricInput,
): number | null =>
  isMetricReference(input.metric) && input.metric.databaseId != null
    ? input.metric.databaseId
    : null;

export const getMetricSourceTableIdFromInput = (
  input: MetricInput,
): number | null =>
  isMetricReference(input.metric) && input.metric.sourceTableId != null
    ? input.metric.sourceTableId
    : null;

export const getMetricSourceCardIdFromInput = (
  input: MetricInput,
): number | null =>
  isMetricReference(input.metric) && input.metric.sourceCardId != null
    ? input.metric.sourceCardId
    : null;

export const getMetricSourceIdFromInput = (
  input: MetricInput,
): TableId | null => {
  const sourceTableId = getMetricSourceTableIdFromInput(input);

  if (sourceTableId != null) {
    return Number(sourceTableId);
  }

  const sourceCardId = getMetricSourceCardIdFromInput(input);

  return sourceCardId == null ? null : getQuestionVirtualTableId(sourceCardId);
};

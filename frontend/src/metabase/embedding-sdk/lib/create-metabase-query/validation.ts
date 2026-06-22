import { getMetricMappedTableIdsFromQuery } from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";

import {
  isCountAggregation,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
} from "./guards";
import { getMetricDimensionValues, normalizeBreakout } from "./query-utils";
import type { MetricQueryRuntime } from "./runtime-types";

export const validateMetricTableScopedInputs = (query: MetricQueryRuntime) =>
  validateTableScopedInputs({
    allowedTableIds: getMetricMappedTableIdsFromQuery(query),
    breakouts: query.breakouts,
    filters: query.filters,
    measures: query.measures,
    context: "Metric query",
  });

export function validateMetricGeneratedDimensions(query: MetricQueryRuntime) {
  query.filters?.forEach((filter) => {
    if (isTableDimensionFilter(filter)) {
      validateMetricDimensionForTableField(query, filter.dimension);
    }
  });

  query.breakouts?.forEach((breakout) => {
    const field = getTableFieldFromBreakout(breakout);

    if (field) {
      validateMetricDimensionForTableField(query, field);
    }
  });
}

export function validateTableScopedInputs({
  allowedTableIds,
  filters,
  measures,
  breakouts,
  context,
}: {
  allowedTableIds: readonly number[] | null;
  filters?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  context: string;
}) {
  if (!allowedTableIds) {
    return;
  }

  filters?.forEach((filter) => {
    if (isSegmentSchema(filter)) {
      validateGeneratedTableId({
        tableId: filter.tableId,
        allowedTableIds,
        context: `${context} segments`,
      });
    }

    if (
      isTableDimensionFilter(filter) &&
      typeof filter.dimension.tableId === "number"
    ) {
      validateGeneratedTableId({
        tableId: filter.dimension.tableId,
        allowedTableIds,
        context: `${context} filters`,
      });
    }
  });

  measures?.forEach((measure) => {
    validateGeneratedMeasure({
      measure,
      context: `${context} measures`,
    });

    if (isMeasureSchema(measure)) {
      validateGeneratedTableId({
        tableId: measure.tableId,
        allowedTableIds,
        context: `${context} measures`,
      });
    }

    if (
      isFieldAggregation(measure) &&
      isTableFieldSchema(measure.dimension) &&
      typeof measure.dimension.tableId === "number"
    ) {
      validateGeneratedTableId({
        tableId: measure.dimension.tableId,
        allowedTableIds,
        context: `${context} aggregations`,
      });
    }
  });

  breakouts?.forEach((breakout) => {
    const field = getTableFieldFromBreakout(breakout);

    if (field && typeof field.tableId === "number") {
      validateGeneratedTableId({
        tableId: field.tableId,
        allowedTableIds,
        context: `${context} breakouts`,
      });
    }
  });
}

function getTableFieldFromBreakout(breakout: unknown) {
  const { dimension } = normalizeBreakout(breakout);

  return isTableFieldSchema(dimension) ? dimension : null;
}

export function validateMetricDimensionForTableField(
  query: MetricQueryRuntime,
  field: FieldSchema,
) {
  const dimension = getMetricDimensionFields(query).find((dimension) => {
    return fieldsMatch(dimension, field);
  });

  if (!dimension) {
    throw new Error(
      "Metric query table-field filters must match a generated metric dimension for the metric. Use schema.metrics.*.dimensions.* or pass the full generated metric object.",
    );
  }
}

export const getMetricDimensionFields = (query: MetricQueryRuntime) =>
  getMetricDimensionValues(query.metric, isTableFieldSchema);

function fieldsMatch(left: FieldSchema, right: FieldSchema) {
  return (
    left.tableId === right.tableId &&
    ((left.fieldId != null && left.fieldId === right.fieldId) ||
      left.name === right.name)
  );
}

function validateGeneratedMeasure({
  measure,
  context,
}: {
  measure: unknown;
  context: string;
}) {
  if (
    isMeasureSchema(measure) ||
    isCountAggregation(measure) ||
    isFieldAggregation(measure)
  ) {
    return;
  }

  throw new Error(
    `${context} must use generated semantic-layer measures from schema.tables.*.measures.*.`,
  );
}

function validateGeneratedTableId({
  tableId,
  allowedTableIds,
  context,
}: {
  tableId: number;
  allowedTableIds: readonly number[] | null;
  context: string;
}) {
  if (!allowedTableIds || allowedTableIds.includes(tableId)) {
    return;
  }

  throw new Error(
    `${context} must belong to one of the query's mapped tables. Expected table id ${tableId} to be one of ${allowedTableIds.join(
      ", ",
    )}.`,
  );
}

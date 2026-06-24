import { getMetricMappedTableIdsFromInput } from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";

import {
  isCountAggregation,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
} from "./guards";
import type { MetricQueryInput } from "./input-types";
import {
  getMetricDimensionValues,
  normalizeBreakout,
  normalizeSort,
} from "./input-utils";

export const validateMetricTableScopedInputs = (input: MetricQueryInput) =>
  validateTableScopedInputs({
    allowedTableIds: getMetricMappedTableIdsFromInput(input),
    breakouts: input.breakouts,
    filters: input.filters,
    measures: input.measures,
    sorts: input.sorts,
    context: "Metric query",
  });

export function validateMetricGeneratedDimensions(input: MetricQueryInput) {
  input.filters?.forEach((filter) => {
    if (isTableDimensionFilter(filter)) {
      validateMetricDimensionForTableField(input, filter.dimension);
    }
  });

  input.breakouts?.forEach((breakout) => {
    const field = getTableFieldFromBreakout(breakout);

    if (field) {
      validateMetricDimensionForTableField(input, field);
    }
  });

  input.sorts?.forEach((sort) => {
    const field = getTableFieldFromSort(sort);

    if (field) {
      validateMetricDimensionForTableField(input, field);
    }
  });
}

export function validateTableScopedInputs({
  allowedTableIds,
  context,

  filters,
  measures,
  breakouts,
  sorts,
}: {
  allowedTableIds: readonly number[] | null;
  context: string;

  filters?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  sorts?: readonly unknown[];
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

  sorts?.forEach((sort) => {
    const field = getTableFieldFromSort(sort);

    if (field && typeof field.tableId === "number") {
      validateGeneratedTableId({
        tableId: field.tableId,
        allowedTableIds,
        context: `${context} sorts`,
      });
    }
  });
}

function getTableFieldFromBreakout(breakout: unknown) {
  const { dimension } = normalizeBreakout(breakout);

  return isTableFieldSchema(dimension) ? dimension : null;
}

function getTableFieldFromSort(sort: unknown) {
  const { column } = normalizeSort(sort);

  return isTableFieldSchema(column) ? column : null;
}

export function validateMetricDimensionForTableField(
  input: MetricQueryInput,
  field: FieldSchema,
) {
  const dimension = getMetricDimensionFields(input).find((dimension) => {
    return fieldsMatch(dimension, field);
  });

  if (!dimension) {
    throw new Error(
      "Metric query table-field filters must match a generated metric dimension for the metric. Use schema.metrics.*.dimensions.* or pass the full generated metric object.",
    );
  }
}

export const getMetricDimensionFields = (input: MetricQueryInput) =>
  getMetricDimensionValues(input.metric, isTableFieldSchema);

const fieldsMatch = (left: FieldSchema, right: FieldSchema) =>
  left.tableId === right.tableId &&
  ((left.fieldId != null && left.fieldId === right.fieldId) ||
    left.name === right.name);

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
  context,
  allowedTableIds,
}: {
  tableId: number;
  context: string;
  allowedTableIds: readonly number[] | null;
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

import {
  getMetricMappedTableIds,
  isCountAggregation,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isTableDimensionFilter,
  isTableFieldSchema,
} from "./guards";
import type { MetricQueryRuntime } from "./runtime-types";

export function validateMetricTableScopedInputs(query: MetricQueryRuntime) {
  validateTableScopedInputs({
    allowedTableIds: getMetricMappedTableIds(query),
    breakouts: query.breakouts,
    filters: query.filters,
    measures: query.measures,
    context: "Metric query",
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
  if (isTableFieldSchema(breakout)) {
    return breakout;
  }

  if (
    typeof breakout === "object" &&
    breakout != null &&
    "dimension" in breakout &&
    isTableFieldSchema(breakout.dimension)
  ) {
    return breakout.dimension;
  }

  return null;
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

import {
  getMetricMappedTableIds,
  isMeasureSchema,
  isSegmentSchema,
} from "./guards";
import type { MetricQueryRuntime } from "./runtime-types";

export function validateMetricTableScopedInputs(query: MetricQueryRuntime) {
  validateTableScopedInputs({
    allowedTableIds: getMetricMappedTableIds(query),
    filters: query.filters,
    measures: query.measures,
    context: "Metric query",
  });
}

export function validateTableScopedInputs({
  allowedTableIds,
  filters,
  measures,
  context,
}: {
  allowedTableIds: readonly number[] | null;
  filters?: readonly unknown[];
  measures?: readonly unknown[];
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
  });
}

function validateGeneratedMeasure({
  measure,
  context,
}: {
  measure: unknown;
  context: string;
}) {
  if (isMeasureSchema(measure)) {
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

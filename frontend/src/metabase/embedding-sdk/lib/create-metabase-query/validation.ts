import type { TableQueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { isMetricReference } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { MetricSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isObject } from "metabase-types/guards";

export function validateQueryInput(input: TableQueryInput) {
  validateLimit(input.limit);
  validateTableScopedInputs(input);
}

function validateLimit(limit: number | undefined) {
  if (limit == null) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Table query limit must be a positive integer.");
  }
}

function validateTableScopedInputs(input: TableQueryInput) {
  const tableId = input.source.id;

  input.fields?.forEach((field) => {
    validateGeneratedTableReference(field, tableId, "Table query fields");
  });

  input.filters?.forEach((filter) => {
    if (isTableScopedReference(filter)) {
      validateGeneratedTableReference(filter, tableId, "Table query filters");
      return;
    }

    validateGeneratedTableReference(
      getFirstOperatorArg(filter),
      tableId,
      "Table query filters",
    );
  });

  input.aggregations?.forEach((aggregation) => {
    if (isMetricReference(aggregation)) {
      validateMetricAggregation(aggregation, tableId);
      return;
    }

    if (isTableScopedReference(aggregation)) {
      validateGeneratedTableReference(
        aggregation,
        tableId,
        "Table query aggregations",
      );
      return;
    }

    validateGeneratedTableReference(
      getFirstOperatorArg(aggregation),
      tableId,
      "Table query aggregations",
    );
  });

  input.breakouts?.forEach((breakout) => {
    validateGeneratedTableReference(breakout, tableId, "Table query breakouts");
  });
}

function validateGeneratedTableReference(
  reference: unknown,
  expectedTableId: number,
  context: string,
) {
  const actualTableId = getTableId(reference);

  if (actualTableId == null || actualTableId === expectedTableId) {
    return;
  }

  if (getSourceFieldId(reference) != null) {
    return;
  }

  throw new Error(
    `${context} must belong to source table ${expectedTableId}, but received table id ${actualTableId}.`,
  );
}

function isTableScopedReference(value: unknown): value is { tableId?: number } {
  return isObject(value) && "tableId" in value;
}

function getFirstOperatorArg(value: unknown) {
  if (
    !isObject(value) ||
    value.type !== "operator" ||
    !Array.isArray(value.args)
  ) {
    return undefined;
  }

  return value.args[0];
}

function getTableId(value: unknown): number | undefined {
  if (!isTableScopedReference(value) || typeof value.tableId !== "number") {
    return undefined;
  }

  return value.tableId;
}

function getSourceFieldId(value: unknown): number | undefined {
  if (!isObject(value) || typeof value.sourceFieldId !== "number") {
    return undefined;
  }

  return value.sourceFieldId;
}

function validateMetricAggregation(metric: MetricSchema, tableId: number) {
  // Source-card Metrics need a saved-question source so Lib scopes metric
  // dimensions to the card stage. EMB-2045 will add that source path:
  if (metric.sourceCardId != null) {
    throw new Error(
      "Table query metric aggregations cannot use source-card Metrics. Use a saved question source for source-card Metrics.",
    );
  }

  const allowedTableIds = getMetricAllowedTableIds(metric);

  if (allowedTableIds === null) {
    throw new Error(
      "Table query metric aggregations must include source table metadata.",
    );
  }

  if (allowedTableIds.includes(tableId)) {
    return;
  }

  throw new Error(
    `Table query metric aggregations must belong to source table ${tableId}, but received mapped table ids ${allowedTableIds.join(
      ", ",
    )}.`,
  );
}

function getMetricAllowedTableIds(metric: MetricSchema) {
  if (metric.mappedTableIds?.length) {
    return metric.mappedTableIds;
  }

  if (metric.sourceTableId != null) {
    return [metric.sourceTableId];
  }

  return null;
}

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

  input.orderBys?.forEach((orderBy) => {
    if (isAggregationResultReference(input.aggregations, orderBy)) {
      return;
    }

    if (
      isGroupedQuery(input) &&
      !isBreakoutReference(input.breakouts, orderBy)
    ) {
      throw new Error(
        "Table query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
      );
    }

    validateGeneratedTableReference(orderBy, tableId, "Table query orderBys");
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

function isCountAggregation(value: unknown) {
  return (
    isObject(value) &&
    value.type === "operator" &&
    value.operator === "count" &&
    Array.isArray(value.args) &&
    value.args.length === 0
  );
}

function isGroupedQuery(input: QueryInput) {
  return Boolean(input.aggregations?.length || input.breakouts?.length);
}

function isAggregationResultReference(
  aggregations: readonly unknown[] | undefined,
  value: unknown,
) {
  if (
    !isObject(value) ||
    value.type !== "column" ||
    typeof value.name !== "string"
  ) {
    return false;
  }

  return getAggregationResultColumnNames(aggregations).includes(value.name);
}

function getAggregationResultColumnNames(
  aggregations: readonly unknown[] | undefined,
) {
  return (aggregations ?? []).flatMap((aggregation) => {
    if (isCountAggregation(aggregation)) {
      return ["count"];
    }

    const columns = getColumns(aggregation);

    if (!columns) {
      return [];
    }

    return columns.flatMap((column) =>
      isObject(column) && typeof column.name === "string" ? [column.name] : [],
    );
  });
}

function getColumns(value: unknown) {
  if (!isObject(value) || !("columns" in value)) {
    return null;
  }

  return Array.isArray(value.columns) ? value.columns : null;
}

function isBreakoutReference(
  breakouts: QueryInput["breakouts"] | undefined,
  value: unknown,
) {
  if (!isObject(value)) {
    return false;
  }

  return (breakouts ?? []).some(
    (breakout) =>
      fieldsMatch(breakout, value) && bucketOptionsMatch(breakout, value),
  );
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

function fieldsMatch(left: unknown, right: Record<string, unknown>) {
  if (!isObject(left)) {
    return false;
  }

  const leftTableId = getTableId(left);
  const rightTableId = getTableId(right);
  const leftFieldId = typeof left.fieldId === "number" ? left.fieldId : null;
  const rightFieldId = typeof right.fieldId === "number" ? right.fieldId : null;
  const leftSourceFieldId = getSourceFieldId(left);
  const rightSourceFieldId = getSourceFieldId(right);

  return (
    leftTableId === rightTableId &&
    leftSourceFieldId === rightSourceFieldId &&
    ((leftFieldId != null && leftFieldId === rightFieldId) ||
      left.name === right.name)
  );
}

function bucketOptionsMatch(left: unknown, right: Record<string, unknown>) {
  if (!isObject(left)) {
    return false;
  }

  return (
    left.unit === right.unit &&
    binningOptionsMatch(left.binning, right.binning) &&
    left.bins === right.bins &&
    left.binWidth === right.binWidth
  );
}

function binningOptionsMatch(left: unknown, right: unknown) {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  return (
    left.strategy === right.strategy &&
    left["num-bins"] === right["num-bins"] &&
    left["bin-width"] === right["bin-width"]
  );
}

import { isObject } from "metabase-types/guards";

import type { TableQueryInput } from "./input-types";

export function validateTableQueryInput(input: TableQueryInput) {
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
    validateGeneratedTableId(getTableId(field), tableId, "Table query fields");
  });

  input.filters?.forEach((filter) => {
    if (isTableScopedReference(filter)) {
      validateGeneratedTableId(
        getTableId(filter),
        tableId,
        "Table query filters",
      );
      return;
    }

    validateGeneratedTableId(
      getTableId(getFirstOperatorArg(filter)),
      tableId,
      "Table query filters",
    );
  });

  input.aggregations?.forEach((aggregation) => {
    if (isTableScopedReference(aggregation)) {
      validateGeneratedTableId(
        getTableId(aggregation),
        tableId,
        "Table query aggregations",
      );
      return;
    }

    validateGeneratedTableId(
      getTableId(getFirstOperatorArg(aggregation)),
      tableId,
      "Table query aggregations",
    );
  });

  input.breakouts?.forEach((breakout) => {
    validateGeneratedTableId(
      getTableId(breakout),
      tableId,
      "Table query breakouts",
    );
  });
}

function validateGeneratedTableId(
  actualTableId: number | undefined,
  expectedTableId: number,
  context: string,
) {
  if (actualTableId == null || actualTableId === expectedTableId) {
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

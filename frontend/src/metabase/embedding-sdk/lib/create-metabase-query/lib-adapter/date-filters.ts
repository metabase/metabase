import type { ColumnMetadata, ExpressionClause } from "metabase-lib";
import * as Lib from "metabase-lib";

import type { FilterOperator } from "../input-types";

import {
  isDateFilterOperator,
  isSpecificDateFilterOperator,
} from "./operators";

type DateFilterInput = {
  operator: FilterOperator;
  column: ColumnMetadata;
  values: readonly unknown[];
  hasTime: boolean;
};

export function buildLibDateFilter({
  operator,
  column,
  values,
  hasTime,
}: DateFilterInput): ExpressionClause | null {
  if (!isDateFilterOperator(operator)) {
    return null;
  }

  if (!values.every(isDateFilterValue)) {
    return null;
  }

  if (!isSpecificDateFilterOperator(operator)) {
    return Lib.expressionClause(operator, [
      column,
      ...values.map(normalizeDateFilterExpressionValue),
    ]);
  }

  return Lib.specificDateFilterClause({
    operator,
    column,
    values: values.map((value) => new Date(value)),
    hasTime,
  });
}

const isDateFilterValue = (value: unknown): value is string | number | Date =>
  typeof value === "string" ||
  typeof value === "number" ||
  value instanceof Date;

const normalizeDateFilterExpressionValue = (
  value: string | number | Date,
): string | number => (value instanceof Date ? value.toISOString() : value);

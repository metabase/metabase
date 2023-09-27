import * as ML from "cljs/metabase.lib.js";

import { expressionClause } from "./expression";
import type {
  BooleanFilterParts,
  ColumnWithOperators,
  ExpressionClause,
  FilterClause,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  TextFilterParts,
} from "./types";

export function filterableColumns(
  query: Query,
  stageIndex: number,
): ColumnWithOperators[] {
  return ML.filterable_columns(query, stageIndex);
}

export function filter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause | ExpressionClause,
): Query {
  return ML.filter(query, stageIndex, filterClause);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return ML.filters(query, stageIndex);
}

export function textFilterClause({
  operator,
  column,
  values,
  options,
}: TextFilterParts): ExpressionClause {
  return expressionClause(operator, options, [column, ...values]);
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return expressionClause(operator, null, [column, ...values]);
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return expressionClause(operator, null, [column, ...values]);
}

export function relativeDateFilterClause({
  column,
  value,
  unit,
  offsetValue,
  offsetUnit,
  options,
}: RelativeDateFilterParts): ExpressionClause {
  if (offsetValue == null || offsetUnit == null) {
    return expressionClause("time-interval", options, [column, value, unit]);
  }

  return expressionClause("between", null, [
    expressionClause("+", null, [
      column,
      expressionClause("interval", null, [-offsetValue, offsetUnit]),
    ]),
    expressionClause("relative-datetime", null, [
      value < 0 ? value : 0,
      offsetUnit,
    ]),
    expressionClause("relative-datetime", null, [
      value > 0 ? value : 0,
      offsetUnit,
    ]),
  ]);
}

import * as ML from "cljs/metabase.lib.js";

import { expressionClause } from "./expression";
import type {
  BooleanFilterParts,
  ColumnMetadata,
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
): ColumnMetadata[] {
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
  return expressionClause(operator, [column, ...values], options);
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
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
    return expressionClause("time-interval", [column, value, unit], options);
  }

  return expressionClause("between", [
    expressionClause("+", [
      column,
      expressionClause("interval", [-offsetValue, offsetUnit]),
    ]),
    expressionClause("relative-datetime", [value < 0 ? value : 0, offsetUnit]),
    expressionClause("relative-datetime", [value > 0 ? value : 0, offsetUnit]),
  ]);
}

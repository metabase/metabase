import * as ML from "cljs/metabase.lib.js";

import type {
  BooleanExpression,
  ColumnMetadata,
  ColumnWithOperators,
  ExpressionArg,
  ExternalOp,
  FilterOperator,
  Query,
} from "./types";

export function filterableColumns(
  query: Query,
  stageIndex: number,
): ColumnWithOperators[] {
  return ML.filterable_columns(query, stageIndex);
}

export function filterableColumnOperators(
  filterableColumn: ColumnWithOperators,
): FilterOperator[] {
  return ML.filterable_column_operators(filterableColumn);
}

export function filterClause(
  filterOperator: FilterOperator,
  column: ColumnMetadata,
  ...args: ExpressionArg[]
): ExternalOp {
  return ML.filter_clause(filterOperator, column, ...args);
}

export function filter(
  query: Query,
  stageIndex: number,
  booleanExpression: ExternalOp,
): Query {
  return ML.filter(query, stageIndex, booleanExpression);
}

export function filters(query: Query, stageIndex: number): BooleanExpression[] {
  return ML.filters(query, stageIndex);
}

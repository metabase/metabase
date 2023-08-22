import * as ML from "cljs/metabase.lib.js";

import type {
  ColumnMetadata,
  ColumnWithOperators,
  ExpressionArg,
  FilterOperator,
  FilterClause,
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
): FilterClause {
  return ML.filter_clause(filterOperator, column, ...args);
}

export function filter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): Query {
  return ML.filter(query, stageIndex, filter);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return ML.filters(query, stageIndex);
}

export function filterOperator(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
) {
  return ML.filter_operator(query, stageIndex, filterClause);
}

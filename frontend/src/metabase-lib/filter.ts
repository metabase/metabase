import * as ML from "cljs/metabase.lib.js";

import Filter from "metabase-lib/queries/structured/Filter";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import type {
  ColumnMetadata,
  ColumnWithOperators,
  ExpressionArg,
  ExternalOp,
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
  booleanExpression: ExternalOp,
): Query {
  return ML.filter(query, stageIndex, booleanExpression);
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

// this probably doesn't go here
export function toLegacyFilter(
  query: Query,
  legacyQuery: StructuredQuery,
  filterClause: FilterClause,
): Filter {
  const filter = ML.external_op(filterClause);
  const field = ML.external_op(filter.args[0]);

  return new Filter([
    filter.operator,
    [field.operator, ...field.args, null],
    ...filter.args.slice(1),
  ], null, legacyQuery);
}

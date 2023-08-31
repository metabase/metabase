import * as ML from "cljs/metabase.lib.js";

import type { FieldFilter, FieldReference } from "metabase-types/api";
import type {
  ColumnMetadata,
  ColumnWithOperators,
  ExpressionArg,
  ExternalOp,
  FilterOperator,
  FilterClause,
  FilterParts,
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

export function filterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): FilterParts {
  return ML.filter_parts(query, stageIndex, filterClause);
}

export function findFilterForLegacyFilter(
  query: Query,
  stageIndex: number,
  legacyFilterClause: FieldFilter,
): FilterClause {
  return ML.find_filter_for_legacy_filter(
    query,
    stageIndex,
    legacyFilterClause,
  );
}

/**
 * Given a legacy ["field" ...] reference, return the filterable `ColumnWithOperators` that best fits it.
 */
export function findFilterableColumnForLegacyRef(
  query: Query,
  stageIndex: number,
  legacyFieldRef: FieldReference,
): ColumnWithOperators | null {
  return ML.find_filterable_column_for_legacy_ref(
    query,
    stageIndex,
    legacyFieldRef,
  );
}

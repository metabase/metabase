import * as ML from "cljs/metabase.lib.js";

import type {
  ColumnWithOperators,
  ExpressionClause,
  FilterClause,
  Query,
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

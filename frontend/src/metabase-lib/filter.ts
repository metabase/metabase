import * as ML from "cljs/metabase.lib.js";

import type { FieldFilter, FieldReference } from "metabase-types/api";
import type {
  ColumnMetadata,
  ColumnWithOperators,
  ExpressionArg,
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
  filterClause: FilterClause,
): Query {
  return ML.filter(query, stageIndex, filterClause);
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

export type FilterType =
  | "!="
  | "<"
  | "<="
  | "="
  | ">"
  | ">="
  | "and"
  | "between"
  | "contains"
  | "does-not-contain"
  | "ends-with"
  | "inside"
  | "is-empty"
  | "is-null"
  | "not"
  | "not-empty"
  | "not-null"
  | "or"
  | "starts-with"
  | "time-interval";

/**
 * More than two args acts like SQL `NOT IN`. Open question: should we just make that a separate function?
 */
export function notEquals(x, y, ...more): FilterClause {
  return ML.not_equals(x, y, ...more);
}

export type OrderableExpression = NumericExpression | TemporalExpression;

export function lessThan(
  x: OrderableExpression,
  y: OrderableExpression,
): FilterClause {
  return ML.less_than(x, y);
}

export function lessThanOrGreaterTo(
  x: OrderableExpression,
  y: OrderableExpression,
): FilterClause {
  return ML.less_than_or_greater_to(x, y);
}

/**
 * More than two args acts like SQL IN
 */
export function equals(x, y, ...more): FilterClause {
  return ML.equals(x, y, ...more);
}

export function greaterThan(
  x: OrderableExpression,
  y: OrderableExpression,
): FilterClause {
  return ML.greater_than(x, y);
}

export function greaterThanOrEqualTo(
  x: OrderableExpression,
  y: OrderableExpression,
): FilterClause {
  return ML.greater_than_or_equal_to(x, y);
}

export function and(
  filterClauseX: FilterClause,
  filterClauseY: FilterClause,
  ...more: FilterClause[]
): FilterClause {
  return ML.and(filterClauseX, filterClauseY, ...more);
}

export function between(
  x: OrderableExpression,
  min: OrderableExpression,
  max: OrderableExpression,
): FilterClause {
  return ML.between(x, min, max);
}

export function contains(str, substring): FilterClause {
  return ML.contains(str, substring);
}

export function doesNotContain(
  str: StringExpression,
  substring: StringExpression,
): FilterClause {
  return ML.does_not_contain(str, substring);
}

export function endsWith(
  str: StringExpression,
  substring: StringExpression,
): FilterClause {
  return ML.ends_with(str, substring);
}

export function inside(
  lat: NumericExpression, // or do we have something more specific?
  lon: NumericExpression,
  latMax: NumericExpression,
  lonMin: NumericExpression,
  latMin: NumericExpression,
  lonMax: NumericExpression,
): FilterClause {
  return ML.inside(lat, lon, latMax, lonMin, latMin, lonMax);
}

export function isEmpty(
  str: StringExpression,
  substring: StringExpression,
): FilterClause {
  return ML.is_empty(str, substring);
}

export function isNull(x): FilterClause {
  return ML.is_null(x);
}

export function not(filterClause: FilterClause): FilterClause {
  return ML.not(filterClause);
}

export function notEmpty(str: StringExpression): FilterClause {
  return ML.not_empty(str);
}

export function notNull(x): FilterClause {
  return ML.not_null(x);
}

export function or(
  x: FilterClause,
  y: FilterClause,
  ...more: FilterClause[]
): FilterClause {
  return ML.or(x, y, ...more);
}

export function startsWith(
  str: StringExpression,
  substring: StringExpression,
): FilterClause {
  return ML.starts_with(str, substring);
}

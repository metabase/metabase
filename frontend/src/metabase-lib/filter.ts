import moment, { type Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import {
  boolean_filter_clause,
  boolean_filter_parts,
  filter as cljs_filter,
  filters as cljs_filters,
  coordinate_filter_clause,
  coordinate_filter_parts,
  default_filter_clause,
  default_filter_parts,
  exclude_date_filter_clause,
  exclude_date_filter_parts,
  filter_args_display_name,
  filterable_column_operators,
  filterable_columns,
  number_filter_clause,
  number_filter_parts,
  relative_date_filter_clause,
  relative_date_filter_parts,
  specific_date_filter_clause,
  specific_date_filter_parts,
  string_filter_clause,
  string_filter_parts,
  time_filter_clause,
  time_filter_parts,
  update_lat_lon_filter,
  update_numeric_filter,
  update_temporal_filter,
} from "cljs/metabase.lib.js";
import type { CardId } from "metabase-types/api";

import { expressionParts } from "./expression";
import { isSegmentMetadata } from "./metadata";
import { removeClause } from "./query";
import type {
  BooleanFilterParts,
  ColumnMetadata,
  CoordinateFilterParts,
  DefaultFilterParts,
  ExcludeDateFilterParts,
  ExpressionClause,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SegmentMetadata,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "./types";

export function filterableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return filterable_columns(query, stageIndex);
}

export function filterableColumnOperators(
  column: ColumnMetadata,
): FilterOperator[] {
  return filterable_column_operators(column);
}

export function filter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause | ExpressionClause | SegmentMetadata,
): Query {
  return cljs_filter(query, stageIndex, filterClause);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return cljs_filters(query, stageIndex);
}

export function removeFilters(query: Query, stageIndex: number): Query {
  return filters(query, stageIndex).reduce(
    (newQuery, filter) => removeClause(newQuery, stageIndex, filter),
    query,
  );
}

export function filterArgsDisplayName(
  query: Query,
  stageIndex: number,
  clause: FilterClause,
): string {
  return filter_args_display_name(query, stageIndex, clause);
}

export function stringFilterClause({
  operator,
  column,
  values,
  options,
}: StringFilterParts): ExpressionClause {
  return string_filter_clause(operator, column, values, options);
}

export function stringFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): StringFilterParts | null {
  return string_filter_parts(query, stageIndex, filterClause);
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return number_filter_clause(operator, column, values);
}

export function numberFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): NumberFilterParts | null {
  return number_filter_parts(query, stageIndex, filterClause);
}

export function coordinateFilterClause({
  operator,
  column,
  longitudeColumn,
  values,
}: CoordinateFilterParts): ExpressionClause {
  return coordinate_filter_clause(operator, column, longitudeColumn, values);
}

export function coordinateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): CoordinateFilterParts | null {
  return coordinate_filter_parts(query, stageIndex, filterClause);
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return boolean_filter_clause(operator, column, values);
}

export function booleanFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  return boolean_filter_parts(query, stageIndex, filterClause);
}

export function specificDateFilterClause({
  operator,
  column,
  values,
  hasTime,
}: SpecificDateFilterParts): ExpressionClause {
  return specific_date_filter_clause(
    operator,
    column,
    values.map((value) => moment(value)),
    hasTime,
  );
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const filterParts = specific_date_filter_parts(
    query,
    stageIndex,
    filterClause,
  );
  if (!filterParts) {
    return null;
  }
  return {
    ...filterParts,
    values: filterParts.values.map((value: Moment) =>
      value.local(true).toDate(),
    ),
  };
}

export function relativeDateFilterClause({
  column,
  value,
  unit,
  offsetValue,
  offsetUnit,
  options,
}: RelativeDateFilterParts): ExpressionClause {
  return relative_date_filter_clause(
    column,
    value,
    unit,
    offsetValue,
    offsetUnit,
    options,
  );
}

export function relativeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): RelativeDateFilterParts | null {
  return relative_date_filter_parts(query, stageIndex, filterClause);
}

export function excludeDateFilterClause({
  operator,
  column,
  unit,
  values,
}: ExcludeDateFilterParts): ExpressionClause {
  return exclude_date_filter_clause(operator, column, unit, values);
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  return exclude_date_filter_parts(query, stageIndex, filterClause);
}

export function timeFilterClause({
  operator,
  column,
  values,
}: TimeFilterParts): ExpressionClause {
  return time_filter_clause(
    operator,
    column,
    values.map((value) => moment(value)),
  );
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const filterParts = time_filter_parts(query, stageIndex, filterClause);
  if (!filterParts) {
    return null;
  }
  return {
    ...filterParts,
    values: filterParts.values.map((value: Moment) => value.toDate()),
  };
}

export function defaultFilterClause({
  operator,
  column,
}: DefaultFilterParts): ExpressionClause {
  return default_filter_clause(operator, column);
}

export function defaultFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): DefaultFilterParts | null {
  return default_filter_parts(query, stageIndex, filterClause);
}

export function filterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): FilterParts | null {
  return (
    stringFilterParts(query, stageIndex, filterClause) ??
    numberFilterParts(query, stageIndex, filterClause) ??
    coordinateFilterParts(query, stageIndex, filterClause) ??
    booleanFilterParts(query, stageIndex, filterClause) ??
    specificDateFilterParts(query, stageIndex, filterClause) ??
    relativeDateFilterParts(query, stageIndex, filterClause) ??
    excludeDateFilterParts(query, stageIndex, filterClause) ??
    timeFilterParts(query, stageIndex, filterClause) ??
    defaultFilterParts(query, stageIndex, filterClause)
  );
}

export function isStandardFilter(
  query: Query,
  stageIndex: number,
  filter: FilterClause,
) {
  return filterParts(query, stageIndex, filter) != null;
}

export function isSegmentFilter(
  query: Query,
  stageIndex: number,
  filter: FilterClause,
) {
  const parts = expressionParts(query, stageIndex, filter);

  return (
    isSegmentMetadata(parts) ||
    // @ts-expect-error: TODO should we remove this branch?
    parts?.operator === "segment"
  );
}

type UpdateLatLonFilterBounds = {
  north: number;
  west: number;
  east: number;
  south: number;
};

/**
 * Add or update a filter against latitude and longitude columns. Used to power the 'brush filter' for map
 visualizations.
 */
export function updateLatLonFilter(
  query: Query,
  stageIndex: number,
  latitudeColumn: ColumnMetadata,
  longitudeColumn: ColumnMetadata,
  cardId: CardId | undefined,
  bounds: UpdateLatLonFilterBounds,
): Query {
  return update_lat_lon_filter(
    query,
    stageIndex,
    latitudeColumn,
    longitudeColumn,
    cardId,
    bounds,
  );
}

/**
 * Add or update a filter against a numeric column. Used to power the 'brush filter'.
 */
export function updateNumericFilter(
  query: Query,
  stageIndex: number,
  numericColumn: ColumnMetadata,
  cardId: CardId | undefined,
  start: number,
  end: number,
): Query {
  return update_numeric_filter(
    query,
    stageIndex,
    numericColumn,
    cardId,
    start,
    end,
  );
}

/**
 * Add or update a filter against a temporal column. Used to power the 'brush filter' for a timeseries visualization.
 * `start` and `end` should be ISO-8601 formatted strings.
 */
export function updateTemporalFilter(
  query: Query,
  stageIndex: number,
  temporalColumn: ColumnMetadata,
  cardId: CardId | undefined,
  start: string | Date,
  end: string | Date,
): Query {
  return update_temporal_filter(
    query,
    stageIndex,
    temporalColumn,
    cardId,
    start,
    end,
  );
}

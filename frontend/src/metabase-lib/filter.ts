import moment, { type Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import * as ML from "cljs/metabase.lib.js";
import type { CardId, DatasetColumn } from "metabase-types/api";

import { expressionParts } from "./expression";
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
  return ML.filterable_columns(query, stageIndex);
}

export function filterableColumnOperators(
  column: ColumnMetadata,
): FilterOperator[] {
  return ML.filterable_column_operators(column);
}

export function filter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause | ExpressionClause | SegmentMetadata,
): Query {
  return ML.filter(query, stageIndex, filterClause);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return ML.filters(query, stageIndex);
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
  return ML.filter_args_display_name(query, stageIndex, clause);
}

export function stringFilterClause({
  operator,
  column,
  values,
  options,
}: StringFilterParts): ExpressionClause {
  return ML.string_filter_clause(operator, column, values, options);
}

export function stringFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): StringFilterParts | null {
  return ML.string_filter_parts(query, stageIndex, filterClause);
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return ML.number_filter_clause(operator, column, values);
}

export function numberFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): NumberFilterParts | null {
  return ML.number_filter_parts(query, stageIndex, filterClause);
}

export function coordinateFilterClause({
  operator,
  column,
  longitudeColumn,
  values,
}: CoordinateFilterParts): ExpressionClause {
  return ML.coordinate_filter_clause(operator, column, longitudeColumn, values);
}

export function coordinateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): CoordinateFilterParts | null {
  return ML.coordinate_filter_parts(query, stageIndex, filterClause);
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return ML.boolean_filter_clause(operator, column, values);
}

export function booleanFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  return ML.boolean_filter_parts(query, stageIndex, filterClause);
}

export function specificDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, hasTime }: SpecificDateFilterParts,
): ExpressionClause {
  return ML.specific_date_filter_clause(
    operator,
    column,
    values.map(value => moment(value)),
    hasTime,
  );
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const filterParts = ML.specific_date_filter_parts(
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
  return ML.relative_date_filter_clause(
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
  return ML.relative_date_filter_parts(query, stageIndex, filterClause);
}

export function excludeDateFilterClause({
  operator,
  column,
  unit,
  values,
}: ExcludeDateFilterParts): ExpressionClause {
  return ML.exclude_date_filter_clause(operator, column, unit, values);
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  return ML.exclude_date_filter_parts(query, stageIndex, filterClause);
}

export function timeFilterClause({
  operator,
  column,
  values,
}: TimeFilterParts): ExpressionClause {
  return ML.time_filter_clause(
    operator,
    column,
    values.map(value => moment(value)),
  );
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const filterParts = ML.time_filter_parts(query, stageIndex, filterClause);
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
  return ML.default_filter_clause(operator, column);
}

export function defaultFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): DefaultFilterParts | null {
  return ML.default_filter_parts(query, stageIndex, filterClause);
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
  const { operator } = expressionParts(query, stageIndex, filter);
  return operator === "segment";
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
  latitudeColumn: DatasetColumn,
  longitudeColumn: DatasetColumn,
  cardId: CardId | undefined,
  bounds: UpdateLatLonFilterBounds,
): Query {
  return ML.update_lat_lon_filter(
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
  numericColumn: DatasetColumn,
  cardId: CardId | undefined,
  start: number,
  end: number,
): Query {
  return ML.update_numeric_filter(
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
  temporalColumn: DatasetColumn,
  cardId: CardId | undefined,
  start: string | Date,
  end: string | Date,
): Query {
  return ML.update_temporal_filter(
    query,
    stageIndex,
    temporalColumn,
    cardId,
    start,
    end,
  );
}

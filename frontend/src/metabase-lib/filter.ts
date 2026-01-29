import dayjs, { type Dayjs } from "dayjs";

import * as ML from "cljs/metabase.lib.js";
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
  Filterable,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SegmentMetadata,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "./types";

export type FilterableColumnsOpts = {
  includeSensitiveFields?: boolean;
};

export function filterableColumns(
  query: Query,
  stageIndex: number,
  opts?: FilterableColumnsOpts,
): ColumnMetadata[] {
  return ML.filterable_columns(query, stageIndex, opts);
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
  filterClause: Filterable,
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
  filterClause: Filterable,
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
  filterClause: Filterable,
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
  filterClause: Filterable,
): BooleanFilterParts | null {
  return ML.boolean_filter_parts(query, stageIndex, filterClause);
}

export function specificDateFilterClause({
  operator,
  column,
  values,
  hasTime,
}: SpecificDateFilterParts): ExpressionClause {
  return ML.specific_date_filter_clause(
    operator,
    column,
    values.map((value) => dayjs(value).toDate()),
    hasTime,
  );
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: Filterable,
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
    // The CLJS code returns dayjs objects in UTC mode. We need to convert them to local Date objects
    // while preserving the time values (not converting the instant). dayjs.local(true) doesn't work
    // like moment.local(true), so we format and reparse as local time.
    values: filterParts.values.map((value: Dayjs) =>
      dayjs(value.format("YYYY-MM-DDTHH:mm:ss.SSS")).toDate(),
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
  filterClause: Filterable,
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
  filterClause: Filterable,
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
    values.map((value) => dayjs(value)),
  );
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: Filterable,
): TimeFilterParts | null {
  const filterParts = ML.time_filter_parts(query, stageIndex, filterClause);
  if (!filterParts) {
    return null;
  }
  return {
    ...filterParts,
    values: filterParts.values.map((value: Dayjs) => value.toDate()),
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
  filterClause: Filterable,
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
  numericColumn: ColumnMetadata,
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
  temporalColumn: ColumnMetadata,
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

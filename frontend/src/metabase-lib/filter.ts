import moment, { type Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import * as ML from "cljs/metabase.lib.js";
import type { CardId, DatasetColumn, TemporalUnit } from "metabase-types/api";

import {
  isBoolean,
  isDateOrDateTime,
  isNumeric,
  isStringOrStringLike,
  isTime,
} from "./column_types";
import {
  DEFAULT_FILTER_OPERATORS,
  EXCLUDE_DATE_BUCKETS,
  EXCLUDE_DATE_FILTER_OPERATORS,
  SPECIFIC_DATE_FILTER_OPERATORS,
} from "./constants";
import { expressionClause, expressionParts } from "./expression";
import { isColumnMetadata } from "./internal";
import { displayInfo } from "./metadata";
import { removeClause } from "./query";
import {
  availableTemporalBuckets,
  temporalBucket,
  withTemporalBucket,
} from "./temporal_bucket";
import type {
  BooleanFilterParts,
  Bucket,
  ColumnMetadata,
  CoordinateFilterParts,
  DefaultFilterOperatorName,
  DefaultFilterParts,
  ExcludeDateFilterOperator,
  ExcludeDateFilterParts,
  ExcludeDateFilterUnit,
  ExpressionArg,
  ExpressionClause,
  ExpressionOperatorName,
  ExpressionParts,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SegmentMetadata,
  SpecificDateFilterOperatorName,
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
  const serializedValues = hasTime
    ? values.map(value => serializeDateTime(value))
    : values.map(value => serializeDate(value));

  const minuteBucket = hasTime
    ? findTemporalBucket(query, stageIndex, column, "minute")
    : undefined;
  const columnWithOrWithoutBucket =
    hasTime && minuteBucket
      ? withTemporalBucket(column, minuteBucket)
      : withTemporalBucket(column, null);

  return expressionClause(operator, [
    columnWithOrWithoutBucket,
    ...serializedValues,
  ]);
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isSpecificDateOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...serializedValues] = args;
  if (
    !isColumnMetadata(column) ||
    !isDateOrDateTime(column) ||
    !isStringLiteralArray(serializedValues)
  ) {
    return null;
  }

  const dateValues = serializedValues.map(deserializeDate);
  if (isDefinedArray(dateValues)) {
    return {
      operator,
      column,
      values: dateValues,
      hasTime: false,
    };
  }

  const dateTimeValues = serializedValues.map(deserializeDateTime);
  if (isDefinedArray(dateTimeValues)) {
    return {
      operator,
      column,
      values: dateTimeValues,
      hasTime: true,
    };
  }

  return null;
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
  return (
    ML.exclude_date_filter_parts(query, stageIndex, filterClause) ??
    legacyExcludeDateFilterParts(query, stageIndex, filterClause)
  );
}

// TODO remove when #50920 is implemented
function legacyExcludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isExcludeDateOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...serializedValues] = args;
  if (!isColumnMetadata(column)) {
    return null;
  }

  const columnWithoutBucket = withTemporalBucket(column, null);
  if (!isDateOrDateTime(columnWithoutBucket)) {
    return null;
  }

  const bucket = temporalBucket(column);
  if (!bucket) {
    return serializedValues.length === 0
      ? { column: columnWithoutBucket, operator, unit: null, values: [] }
      : null;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  if (!isExcludeDateBucket(bucketInfo.shortName)) {
    return null;
  }

  const values = serializedValues.map(value =>
    deserializeExcludeDatePart(value, bucketInfo.shortName),
  );
  if (!isDefinedArray(values)) {
    return null;
  }

  return {
    column: columnWithoutBucket,
    operator,
    unit: bucketInfo.shortName,
    values,
  };
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
  return expressionClause(operator, [column]);
}

export function defaultFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): DefaultFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isDefaultOperator(operator) || args.length !== 1) {
    return null;
  }

  const [column] = args;
  if (
    !isColumnMetadata(column) ||
    // these types have their own filterParts
    isStringOrStringLike(column) ||
    isNumeric(column) ||
    isBoolean(column) ||
    isDateOrDateTime(column) ||
    isTime(column)
  ) {
    return null;
  }

  return {
    operator,
    column,
  };
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

function findTemporalBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  temporalUnit: TemporalUnit,
): Bucket | undefined {
  return availableTemporalBuckets(query, stageIndex, column).find(bucket => {
    const bucketInfo = displayInfo(query, stageIndex, bucket);
    return bucketInfo.shortName === temporalUnit;
  });
}

function isDefined<T>(arg: T | undefined | null): arg is T {
  return arg != null;
}

function isDefinedArray<T>(arg: (T | undefined | null)[]): arg is T[] {
  return arg.every(isDefined);
}

function isStringLiteral(arg: unknown): arg is string {
  return typeof arg === "string";
}

function isStringLiteralArray(arg: unknown): arg is string[] {
  return Array.isArray(arg) && arg.every(isStringLiteral);
}

function isNumberLiteral(arg: unknown): arg is number {
  return typeof arg === "number";
}

function isSpecificDateOperator(
  operator: ExpressionOperatorName,
): operator is SpecificDateFilterOperatorName {
  const operators: ReadonlyArray<string> = SPECIFIC_DATE_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isExcludeDateOperator(
  operator: ExpressionOperatorName,
): operator is ExcludeDateFilterOperator {
  const operators: ReadonlyArray<string> = EXCLUDE_DATE_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isDefaultOperator(
  operator: ExpressionOperatorName,
): operator is DefaultFilterOperatorName {
  const operators: ReadonlyArray<string> = DEFAULT_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isExcludeDateBucket(
  bucketName: string,
): bucketName is ExcludeDateFilterUnit {
  const buckets: ReadonlyArray<string> = EXCLUDE_DATE_BUCKETS;
  return buckets.includes(bucketName);
}

const DATE_FORMAT = "YYYY-MM-DD";
const TIME_FORMAT = "HH:mm:ss";
const DATE_TIME_FORMAT = `${DATE_FORMAT}T${TIME_FORMAT}`;

function serializeDate(date: Date): string {
  return moment(date).format(DATE_FORMAT);
}

function serializeDateTime(date: Date): string {
  return moment(date).format(DATE_TIME_FORMAT);
}

function deserializeDate(value: string): Date | null {
  const date = moment(value, DATE_FORMAT, true);
  if (!date.isValid()) {
    return null;
  }

  return date.toDate();
}

function deserializeDateTime(value: string): Date | null {
  const dateTime = moment.parseZone(value, moment.ISO_8601, true);
  if (!dateTime.isValid()) {
    return null;
  }

  return dateTime.local(true).toDate();
}

function deserializeExcludeDatePart(
  value: ExpressionArg | ExpressionParts,
  temporalUnit: TemporalUnit,
): number | null {
  if (temporalUnit === "hour-of-day") {
    return isNumberLiteral(value) ? value : null;
  }

  if (!isStringLiteral(value)) {
    return null;
  }

  const date = moment(value, DATE_FORMAT, true);
  if (!date.isValid()) {
    return null;
  }

  switch (temporalUnit) {
    case "day-of-week":
      return date.isoWeekday();
    case "month-of-year":
      // we expect month to be 1-12 but in dayjs it's 0-11
      return date.month() + 1;
    case "quarter-of-year":
      return date.quarter();
    default:
      return null;
  }
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

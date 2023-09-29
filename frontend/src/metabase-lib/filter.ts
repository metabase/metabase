import moment from "moment-timezone";
import * as ML from "cljs/metabase.lib.js";

import {
  BOOLEAN_FILTER_OPERATORS,
  EXCLUDE_DATE_FILTER_OPERATORS,
  NUMBER_FILTER_OPERATORS,
  SPECIFIC_DATE_FILTER_OPERATORS,
  STRING_FILTER_OPERATORS,
  TIME_FILTER_OPERATORS,
} from "./constants";
import { expressionClause, expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import {
  availableTemporalBuckets,
  temporalBucket,
  withTemporalBucket,
} from "./temporal_bucket";
import type {
  BooleanFilterOperatorName,
  BooleanFilterParts,
  BucketName,
  ColumnMetadata,
  ExcludeDateFilterOperatorName,
  ExcludeDateFilterParts,
  ExpressionClause,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterOperatorName,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SpecificDateFilterOperatorName,
  SpecificDateFilterParts,
  StringFilterOperatorName,
  StringFilterParts,
  TimeFilterOperatorName,
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
  filterClause: FilterClause | ExpressionClause,
): Query {
  return ML.filter(query, stageIndex, filterClause);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return ML.filters(query, stageIndex);
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

function isNumberLiteralArray(arg: unknown): arg is number[] {
  return Array.isArray(arg) && arg.every(isNumberLiteral);
}

function isBooleanLiteral(arg: unknown): arg is boolean {
  return typeof arg === "boolean";
}

function isBooleanLiteralArray(arg: unknown): arg is boolean[] {
  return Array.isArray(arg) && arg.every(isBooleanLiteral);
}

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

function isStringFilterOperator(arg: unknown): arg is StringFilterOperatorName {
  const operators: ReadonlyArray<string> = STRING_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

function isNumberFilterOperator(arg: unknown): arg is NumberFilterOperatorName {
  const operators: ReadonlyArray<string> = NUMBER_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

function isBooleanFilterOperator(
  arg: unknown,
): arg is BooleanFilterOperatorName {
  const operators: ReadonlyArray<string> = BOOLEAN_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

function isSpecificDateFilterOperator(
  arg: unknown,
): arg is SpecificDateFilterOperatorName {
  const operators: ReadonlyArray<string> = SPECIFIC_DATE_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

function isExcludeDateFilterOperator(
  arg: unknown,
): arg is ExcludeDateFilterOperatorName {
  const operators: ReadonlyArray<string> = EXCLUDE_DATE_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

function isTimeFilterOperator(arg: unknown): arg is TimeFilterOperatorName {
  const operators: ReadonlyArray<string> = TIME_FILTER_OPERATORS;
  return isStringLiteral(arg) && operators.includes(arg);
}

export function stringFilterClause({
  operator,
  column,
  values,
  options,
}: StringFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values], options);
}

export function stringFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): StringFilterParts | null {
  const { operator, args, options } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isStringFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  return {
    column,
    operator,
    values,
    options,
  };
}

export function isStringFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return stringFilterParts(query, stageIndex, filterClause) != null;
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
}

export function numberFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): NumberFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isNumberFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isNumberLiteralArray(values)
  ) {
    return null;
  }

  return {
    column,
    operator,
    values,
  };
}

export function isNumberFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return numberFilterParts(query, stageIndex, filterClause) != null;
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
}

export function booleanFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isBooleanFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isBooleanLiteralArray(values)
  ) {
    return null;
  }

  return {
    column,
    operator,
    values,
  };
}

export function isBooleanFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return booleanFilterParts(query, stageIndex, filterClause) != null;
}

export function specificDateFilterClause({
  operator,
  column,
  values,
}: SpecificDateFilterParts): ExpressionClause {
  throw new TypeError();
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isSpecificDateFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  return {
    column,
    operator,
    values,
  };
}

export function isSpecificDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return specificDateFilterParts(query, stageIndex, filterClause) != null;
}

export function relativeDateFilterClause({
  column,
  value,
  bucket,
  offsetValue,
  offsetBucket,
  options,
}: RelativeDateFilterParts): ExpressionClause {
  if (offsetValue == null || offsetBucket == null) {
    return expressionClause("time-interval", [column, value, bucket], options);
  }

  return expressionClause("between", [
    expressionClause("+", [
      column,
      expressionClause("interval", [-offsetValue, offsetBucket]),
    ]),
    expressionClause("relative-datetime", [value < 0 ? value : 0, bucket]),
    expressionClause("relative-datetime", [value > 0 ? value : 0, bucket]),
  ]);
}

export function relativeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): RelativeDateFilterParts | null {
  return null;
}

export function isRelativeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return relativeDateFilterParts(query, stageIndex, filterClause) != null;
}

const DATE_FORMAT = "yyyy-MM-dd";
const TIME_FORMAT = "HH:mm:SS.sss";

export function excludeDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, bucket: bucketName }: ExcludeDateFilterParts,
): ExpressionClause {
  const bucket = availableTemporalBuckets(query, stageIndex, column).find(
    bucket => displayInfo(query, stageIndex, bucket).shortName === bucketName,
  );
  if (!bucket) {
    throw new TypeError(`Unsupported temporal bucket ${bucketName}`);
  }

  const bucketColumn = withTemporalBucket(column, bucket);
  const bucketValues = values.map(value =>
    formatExcludeDateFilterValue(value, bucketName),
  );

  return expressionClause(operator, [bucketColumn, ...bucketValues]);
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isExcludeDateFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  const bucket = temporalBucket(column);
  if (!bucket) {
    return null;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const bucketValues = values.map(value =>
    parseExcludeDateFilterValue(value, bucketInfo.shortName),
  );

  return {
    column,
    operator,
    values: bucketValues,
    bucket: bucketInfo.shortName,
  };
}

function parseExcludeDateFilterValue(
  value: string,
  bucketName: BucketName,
): number {
  const date = moment(value, DATE_FORMAT);

  switch (bucketName) {
    case "hour-of-day":
      return date.hour();
    case "day-of-week":
      return date.isoWeekday();
    case "month-of-year":
      return date.month() + 1; // moment.month() is 0-based
    case "quarter-of-year":
      return date.quarter();
    default:
      return date.utcOffset();
  }
}

function formatExcludeDateFilterValue(
  value: number,
  bucketName: BucketName,
): string {
  const date = moment();

  switch (bucketName) {
    case "hour-of-day":
      date.hour(value);
      break;
    case "day-of-week":
      date.isoWeekday(value);
      break;
    case "month-of-year":
      date.month(value - 1); // moment.month() is 0-based
      break;
    case "quarter-of-year":
      date.quarter(value);
      break;
    default:
      date.utcOffset(value);
      break;
  }

  return date.format(DATE_FORMAT);
}

export function isExcludeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return excludeDateFilterParts(query, stageIndex, filterClause) != null;
}

export function timeFilterClause({
  operator,
  column,
  values,
}: TimeFilterParts): ExpressionClause {
  const dates = values.map(value => moment(value, moment.ISO_8601));
  if (!dates.every(date => date.isValid())) {
    throw new TypeError("Invalid date format");
  }

  return expressionClause(operator, [
    column,
    ...dates.map(date => date.format(TIME_FORMAT)),
  ]);
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isTimeFilterOperator(operator) ||
    !isColumnMetadata(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  const dates = values.map(value => moment(value, TIME_FORMAT));
  if (!dates.every(date => date.isValid())) {
    return null;
  }

  return {
    column,
    operator,
    values: dates.map(date => date.toISOString()),
  };
}

export function isTimeFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return timeFilterParts(query, stageIndex, filterClause) != null;
}

export function filterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): FilterParts | null {
  return (
    stringFilterParts(query, stageIndex, filterClause) ??
    numberFilterParts(query, stageIndex, filterClause) ??
    booleanFilterParts(query, stageIndex, filterClause) ??
    specificDateFilterParts(query, stageIndex, filterClause) ??
    relativeDateFilterParts(query, stageIndex, filterClause) ??
    excludeDateFilterParts(query, stageIndex, filterClause) ??
    timeFilterParts(query, stageIndex, filterClause)
  );
}

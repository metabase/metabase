// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import * as ML from "cljs/metabase.lib.js";

import {
  isBoolean,
  isTime,
  isDate,
  isCoordinate,
  isString,
  isNumeric,
} from "./column_types";
import {
  BOOLEAN_FILTER_OPERATORS,
  COORDINATE_FILTER_OPERATORS,
  EXCLUDE_DATE_BUCKETS,
  EXCLUDE_DATE_FILTER_OPERATORS,
  NUMBER_FILTER_OPERATORS,
  RELATIVE_DATE_BUCKETS,
  SPECIFIC_DATE_FILTER_OPERATORS,
  STRING_FILTER_OPERATORS,
  STRING_FILTER_OPERATORS_WITH_OPTIONS,
  TIME_FILTER_OPERATORS,
} from "./constants";
import { expressionClause, expressionParts } from "./expression";
import { isColumnMetadata } from "./internal";
import { displayInfo } from "./metadata";
import {
  availableTemporalBuckets,
  temporalBucket,
  withTemporalBucket,
} from "./temporal_bucket";
import type {
  BooleanFilterOperatorName,
  BooleanFilterParts,
  Bucket,
  BucketName,
  ColumnMetadata,
  CoordinateFilterOperatorName,
  CoordinateFilterParts,
  ExcludeDateBucketName,
  ExcludeDateFilterOperatorName,
  ExcludeDateFilterParts,
  ExpressionArg,
  ExpressionClause,
  ExpressionOperatorName,
  ExpressionOptions,
  ExpressionParts,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterOperatorName,
  NumberFilterParts,
  Query,
  RelativeDateBucketName,
  RelativeDateFilterParts,
  SegmentMetadata,
  SpecificDateFilterOperatorName,
  SpecificDateFilterParts,
  StringFilterOperatorName,
  StringFilterOptions,
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
  filterClause: FilterClause | ExpressionClause | SegmentMetadata,
): Query {
  return ML.filter(query, stageIndex, filterClause);
}

export function filters(query: Query, stageIndex: number): FilterClause[] {
  return ML.filters(query, stageIndex);
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
  return expressionClause(
    operator,
    [column, ...values],
    getStringFilterOptions(operator, options),
  );
}

export function stringFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): StringFilterParts | null {
  const { operator, options, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (!isStringOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isColumnMetadata(column) ||
    !isString(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  return {
    operator,
    column,
    values,
    options: getStringFilterOptions(operator, options),
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
  if (!isNumberOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isColumnMetadata(column) ||
    !isNumeric(column) ||
    !isNumberLiteralArray(values)
  ) {
    return null;
  }

  return {
    operator,
    column,
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

export function coordinateFilterClause({
  operator,
  column,
  longitudeColumn,
  values,
}: CoordinateFilterParts): ExpressionClause {
  const args =
    operator === "inside"
      ? [column, longitudeColumn ?? column, ...values]
      : [column, ...values];
  return expressionClause(operator, args);
}

export function coordinateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): CoordinateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isCoordinateOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...otherArgs] = args;
  if (!isColumnMetadata(column) || !isCoordinate(column)) {
    return null;
  }

  if (operator === "inside") {
    const [longitudeColumn, ...values] = otherArgs;
    if (isColumnMetadata(longitudeColumn) && isNumberLiteralArray(values)) {
      return { operator, column, longitudeColumn, values };
    }
  } else {
    const values = otherArgs;
    if (isNumberLiteralArray(values)) {
      return { operator, column, values };
    }
  }

  return null;
}

export function isCoordinateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return coordinateFilterParts(query, stageIndex, filterClause) != null;
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
  if (!isBooleanOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (
    !isColumnMetadata(column) ||
    !isBoolean(column) ||
    !isBooleanLiteralArray(values)
  ) {
    return null;
  }

  return {
    operator,
    column,
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

export function specificDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values }: SpecificDateFilterParts,
): ExpressionClause {
  const hasTime = values.some(hasTimeParts);
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
    !isDate(column) ||
    !isStringLiteralArray(serializedValues)
  ) {
    return null;
  }

  const values = serializedValues.map(value => deserializeDateTime(value));
  if (!isDefinedArray(values)) {
    return null;
  }

  return {
    operator,
    column,
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
  const columnWithoutBucket = withTemporalBucket(column, null);

  if (offsetValue == null || offsetBucket == null) {
    return expressionClause(
      "time-interval",
      [columnWithoutBucket, value, bucket],
      options,
    );
  }

  return expressionClause("between", [
    expressionClause("+", [
      columnWithoutBucket,
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
  const filterParts = expressionParts(query, stageIndex, filterClause);
  return (
    relativeDateFilterPartsWithoutOffset(query, stageIndex, filterParts) ??
    relativeDateFilterPartsWithOffset(query, stageIndex, filterParts)
  );
}

export function isRelativeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return relativeDateFilterParts(query, stageIndex, filterClause) != null;
}

export function excludeDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, bucket: bucketName }: ExcludeDateFilterParts,
): ExpressionClause {
  if (!bucketName) {
    const columnWithoutBucket = withTemporalBucket(column, null);
    return expressionClause(operator, [columnWithoutBucket]);
  }

  const bucket = findTemporalBucket(query, stageIndex, column, bucketName);
  const columnWithBucket = withTemporalBucket(column, bucket ?? null);
  const serializedValues = values.map(value =>
    serializeExcludeDatePart(value, bucketName),
  );

  return expressionClause(operator, [columnWithBucket, ...serializedValues]);
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isExcludeDateOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...serializedValues] = args;
  if (!isColumnMetadata(column) || !isDate(column)) {
    return null;
  }

  const bucket = temporalBucket(column);
  if (!bucket) {
    return serializedValues.length === 0
      ? { column, operator, bucket, values: [] }
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
    column,
    operator,
    bucket: bucketInfo.shortName,
    values,
  };
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
  const serializedValues = values.map(value => serializeTime(value));
  return expressionClause(operator, [column, ...serializedValues]);
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isTimeOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...serializedValues] = args;
  if (
    !isColumnMetadata(column) ||
    !isTime(column) ||
    !isStringLiteralArray(serializedValues)
  ) {
    return null;
  }

  const values = serializedValues.map(value => deserializeTime(value));
  if (!isDefinedArray(values)) {
    return null;
  }

  return {
    operator,
    column,
    values,
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
    coordinateFilterParts(query, stageIndex, filterClause) ??
    booleanFilterParts(query, stageIndex, filterClause) ??
    specificDateFilterParts(query, stageIndex, filterClause) ??
    relativeDateFilterParts(query, stageIndex, filterClause) ??
    excludeDateFilterParts(query, stageIndex, filterClause) ??
    timeFilterParts(query, stageIndex, filterClause)
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
  bucketName: BucketName,
): Bucket | undefined {
  return availableTemporalBuckets(query, stageIndex, column).find(bucket => {
    const bucketInfo = displayInfo(query, stageIndex, bucket);
    return bucketInfo.shortName === bucketName;
  });
}

function isExpression(arg: unknown): arg is ExpressionParts {
  return arg != null && typeof arg === "object";
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

function isNumberOrCurrentLiteral(arg: unknown): arg is number | "current" {
  return isNumberLiteral(arg) || arg === "current";
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

function isStringOperator(
  operator: ExpressionOperatorName,
): operator is StringFilterOperatorName {
  const operators: ReadonlyArray<string> = STRING_FILTER_OPERATORS;
  return operators.includes(operator);
}

function getStringFilterOptions(
  operator: ExpressionOperatorName,
  options: ExpressionOptions,
): StringFilterOptions {
  const operators: ReadonlyArray<string> = STRING_FILTER_OPERATORS_WITH_OPTIONS;
  const supportsOptions = operators.includes(operator);
  return supportsOptions ? { "case-sensitive": false, ...options } : {};
}

function isNumberOperator(
  operator: ExpressionOperatorName,
): operator is NumberFilterOperatorName {
  const operators: ReadonlyArray<string> = NUMBER_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isCoordinateOperator(
  operator: ExpressionOperatorName,
): operator is CoordinateFilterOperatorName {
  const operators: ReadonlyArray<string> = COORDINATE_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isBooleanOperator(
  operator: ExpressionOperatorName,
): operator is BooleanFilterOperatorName {
  const operators: ReadonlyArray<string> = BOOLEAN_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isSpecificDateOperator(
  operator: ExpressionOperatorName,
): operator is SpecificDateFilterOperatorName {
  const operators: ReadonlyArray<string> = SPECIFIC_DATE_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isExcludeDateOperator(
  operator: ExpressionOperatorName,
): operator is ExcludeDateFilterOperatorName {
  const operators: ReadonlyArray<string> = EXCLUDE_DATE_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isTimeOperator(
  operator: ExpressionOperatorName,
): operator is TimeFilterOperatorName {
  const operators: ReadonlyArray<string> = TIME_FILTER_OPERATORS;
  return operators.includes(operator);
}

function isRelativeDateBucket(
  bucketName: string,
): bucketName is RelativeDateBucketName {
  const buckets: ReadonlyArray<string> = RELATIVE_DATE_BUCKETS;
  return buckets.includes(bucketName);
}

function isExcludeDateBucket(
  bucketName: string,
): bucketName is ExcludeDateBucketName {
  const buckets: ReadonlyArray<string> = EXCLUDE_DATE_BUCKETS;
  return buckets.includes(bucketName);
}

const DATE_FORMAT = "yyyy-MM-DD";
const TIME_FORMAT = "HH:mm:ss";
const TIME_FORMATS = ["HH:mm:ss.sss[Z]", "HH:mm:SS.sss", "HH:mm:SS", "HH:mm"];
const TIME_FORMAT_MS = "HH:mm:SS.sss";
const DATE_TIME_FORMAT = `${DATE_FORMAT}T${TIME_FORMAT}`;

function hasTimeParts(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

function serializeDate(date: Date): string {
  return moment(date).format(DATE_FORMAT);
}

function serializeDateTime(date: Date): string {
  return moment(date).format(DATE_TIME_FORMAT);
}

function deserializeDateTime(value: string): Date | null {
  const dateTime = moment.parseZone(value, moment.ISO_8601, true);
  if (!dateTime.isValid()) {
    return null;
  }

  return dateTime.local(true).toDate();
}

function serializeTime(value: Date): string {
  return moment(value).format(TIME_FORMAT_MS);
}

function deserializeTime(value: string): Date | null {
  const time = moment(value, TIME_FORMATS, true);
  if (!time.isValid()) {
    return null;
  }

  return time.toDate();
}

function relativeDateFilterPartsWithoutOffset(
  query: Query,
  stageIndex: number,
  { operator, args, options }: ExpressionParts,
): RelativeDateFilterParts | null {
  if (operator !== "time-interval" || args.length !== 3) {
    return null;
  }

  const [column, value, bucket] = args;
  if (
    !isColumnMetadata(column) ||
    !isDate(column) ||
    !isNumberOrCurrentLiteral(value) ||
    !isStringLiteral(bucket) ||
    !isRelativeDateBucket(bucket)
  ) {
    return null;
  }

  return {
    column,
    value,
    bucket,
    offsetValue: null,
    offsetBucket: null,
    options,
  };
}

function relativeDateFilterPartsWithOffset(
  query: Query,
  stageIndex: number,
  { operator, args, options }: ExpressionParts,
): RelativeDateFilterParts | null {
  if (operator !== "between" || args.length !== 3) {
    return null;
  }

  const [offsetParts, startParts, endParts] = args;
  if (
    !isExpression(offsetParts) ||
    !isExpression(startParts) ||
    !isExpression(endParts) ||
    offsetParts.operator !== "+" ||
    offsetParts.args.length !== 2 ||
    startParts.operator !== "relative-datetime" ||
    startParts.args.length !== 2 ||
    endParts.operator !== "relative-datetime" ||
    endParts.args.length !== 2
  ) {
    return null;
  }

  const [column, intervalParts] = offsetParts.args;
  if (
    !isColumnMetadata(column) ||
    !isDate(column) ||
    !isExpression(intervalParts) ||
    intervalParts.operator !== "interval"
  ) {
    return null;
  }

  const [offsetValue, offsetBucket] = intervalParts.args;
  if (
    !isNumberLiteral(offsetValue) ||
    !isStringLiteral(offsetBucket) ||
    !isRelativeDateBucket(offsetBucket)
  ) {
    return null;
  }

  const [startValue, startBucket] = startParts.args;
  const [endValue, endBucket] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isStringLiteral(startBucket) ||
    !isRelativeDateBucket(startBucket) ||
    !isNumberLiteral(endValue) ||
    !isStringLiteral(endBucket) ||
    !isRelativeDateBucket(endBucket) ||
    startBucket !== endBucket ||
    (startValue !== 0 && endValue !== 0)
  ) {
    return null;
  }

  return {
    column,
    value: startValue < 0 ? startValue : endValue,
    bucket: startBucket,
    offsetValue: offsetValue * -1,
    offsetBucket,
    options,
  };
}

function serializeExcludeDatePart(
  value: number,
  bucketName: ExcludeDateBucketName,
): ExpressionArg {
  if (bucketName === "hour-of-day") {
    return value;
  }

  const date = moment();
  switch (bucketName) {
    case "day-of-week":
      date.isoWeekday(value);
      break;
    case "month-of-year":
      date.month(value);
      break;
    case "quarter-of-year":
      date.quarter(value);
      break;
  }

  return date.format(DATE_FORMAT);
}

function deserializeExcludeDatePart(
  value: ExpressionArg | ExpressionParts,
  bucketName: BucketName,
): number | null {
  if (bucketName === "hour-of-day") {
    return isNumberLiteral(value) ? value : null;
  }

  if (!isStringLiteral(value)) {
    return null;
  }

  const date = moment(value, DATE_FORMAT, true);
  if (!date.isValid()) {
    return null;
  }

  switch (bucketName) {
    case "day-of-week":
      return date.isoWeekday();
    case "month-of-year":
      return date.month();
    case "quarter-of-year":
      return date.quarter();
    default:
      return null;
  }
}

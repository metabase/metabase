import moment from "moment-timezone";
import * as ML from "cljs/metabase.lib.js";

import { isBoolean, isDate, isNumeric, isString, isTime } from "./column_types";
import { expressionClause, expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import {
  availableTemporalBuckets,
  temporalBucket,
  withTemporalBucket,
} from "./temporal_bucket";
import type {
  BooleanFilterParts,
  Bucket,
  BucketName,
  ColumnMetadata,
  DateParts,
  DateTimeParts,
  ExcludeDateFilterParts,
  ExpressionClause,
  ExpressionOperatorName,
  ExpressionParts,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
  TimeParts,
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

export function stringFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, options }: StringFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  return expressionClause(operatorInfo.shortName, [column, ...values], options);
}

export function stringFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): StringFilterParts | null {
  const {
    operator: operatorName,
    options,
    args,
  } = expressionParts(query, stageIndex, filterClause);
  if (args.length < 1) {
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

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator) {
    return null;
  }

  return {
    operator,
    column,
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

export function numberFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values }: NumberFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  return expressionClause(operatorInfo.shortName, [column, ...values]);
}

export function numberFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): NumberFilterParts | null {
  const { operator: operatorName, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
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

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator) {
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

export function booleanFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values }: BooleanFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  return expressionClause(operatorInfo.shortName, [column, ...values]);
}

export function booleanFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): BooleanFilterParts | null {
  const { operator: operatorName, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
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

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator) {
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

export function specificDateFilterOperators(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): FilterOperator[] {
  return filterableColumnOperators(column).filter(operator => {
    const operatorInfo = displayInfo(query, stageIndex, operator);
    return isSpecificDateOperator(operatorInfo.shortName);
  });
}

export function specificDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values }: SpecificDateFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);

  const hasTime = values.some(hasTimeParts);
  const stringValues = hasTime
    ? values.map(value => dateTimePartsToString(value))
    : values.map(value => datePartsToString(value));

  const minuteBucket = hasTime
    ? findTemporalBucket(query, stageIndex, column, "minute")
    : undefined;
  const columnWithOrWithoutBucket =
    hasTime && minuteBucket
      ? withTemporalBucket(column, minuteBucket)
      : withTemporalBucket(column, null);

  return expressionClause(operatorInfo.shortName, [
    columnWithOrWithoutBucket,
    ...stringValues,
  ]);
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const { operator: operatorName, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
    return null;
  }

  const [column, ...stringValues] = args;
  if (
    !isColumnMetadata(column) ||
    !isDate(column) ||
    !isStringLiteralArray(stringValues)
  ) {
    return null;
  }

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator || !isSpecificDateOperator(operatorName)) {
    return null;
  }

  const values = stringValues.map(value => stringToDateTimeParts(value));
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

export function excludeDateFilterOperators(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): FilterOperator[] {
  return filterableColumnOperators(column).filter(operator => {
    const operatorInfo = displayInfo(query, stageIndex, operator);
    return isExcludeDateOperator(operatorInfo.shortName);
  });
}

export function excludeDateFilterTemporalBuckets(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Bucket[] {
  return availableTemporalBuckets(query, stageIndex, column).filter(bucket => {
    const bucketInfo = displayInfo(query, stageIndex, bucket);
    return isExcludeDateBucket(bucketInfo.shortName);
  });
}

export function excludeDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, bucket }: ExcludeDateFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  const columnWithBucket = withTemporalBucket(column, bucket);
  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const stringValues = values.map(value =>
    excludeDatePartToString(value, bucketInfo.shortName),
  );

  return expressionClause(operatorInfo.shortName, [
    columnWithBucket,
    ...stringValues,
  ]);
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  const { operator: operatorName, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
    return null;
  }

  const [column, ...stringValues] = args;
  if (
    !isColumnMetadata(column) ||
    !isDate(column) ||
    !isStringLiteralArray(stringValues)
  ) {
    return null;
  }

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator || !isExcludeDateOperator(operatorName)) {
    return null;
  }

  const bucket = temporalBucket(column);
  if (!bucket) {
    return null;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  if (!isExcludeDateBucket(bucketInfo.shortName)) {
    return null;
  }

  const bucketValues = stringValues.map(value =>
    stringToExcludeDatePart(value, bucketInfo.shortName),
  );
  if (!isDefinedArray(bucketValues)) {
    return null;
  }

  return {
    column,
    operator,
    bucket,
    values: bucketValues,
  };
}

export function isExcludeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return excludeDateFilterParts(query, stageIndex, filterClause) != null;
}

export function timeFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values }: TimeFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  const columnWithoutBucket = withTemporalBucket(column, null);
  const stringValues = values.map(value => timePartsToString(value));

  return expressionClause(operatorInfo.shortName, [
    columnWithoutBucket,
    ...stringValues,
  ]);
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  const { operator: operatorName, args } = expressionParts(
    query,
    stageIndex,
    filterClause,
  );
  if (args.length < 1) {
    return null;
  }

  const [column, ...stringValues] = args;
  if (
    !isColumnMetadata(column) ||
    !isTime(column) ||
    !isStringLiteralArray(stringValues)
  ) {
    return null;
  }

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator) {
    return null;
  }

  const values = stringValues.map(value => stringToTimeParts(value));
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
    booleanFilterParts(query, stageIndex, filterClause) ??
    specificDateFilterParts(query, stageIndex, filterClause) ??
    relativeDateFilterParts(query, stageIndex, filterClause) ??
    excludeDateFilterParts(query, stageIndex, filterClause) ??
    timeFilterParts(query, stageIndex, filterClause)
  );
}

function findFilterOperator(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  operatorName: string,
): FilterOperator | undefined {
  return filterableColumnOperators(column).find(operator => {
    const operatorInfo = displayInfo(query, stageIndex, operator);
    return operatorInfo.shortName === operatorName;
  });
}

function findTemporalBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  bucketName: string,
): Bucket | undefined {
  return availableTemporalBuckets(query, stageIndex, column).find(bucket => {
    const bucketInfo = displayInfo(query, stageIndex, bucket);
    return bucketInfo.shortName === bucketName;
  });
}

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
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

const DATE_FORMAT = "yyyy-MM-dd";
const TIME_FORMAT = "HH:mm:ss";
const DATE_TIME_FORMAT = `${DATE_FORMAT}T${TIME_FORMAT}`;

function hasTimeParts({ hour, minute }: DateTimeParts): boolean {
  return hour !== 0 || minute !== 0;
}

function datePartsToString(parts: DateParts): string {
  const date = moment({
    year: parts.year,
    month: parts.month,
    date: parts.date,
  });

  return date.format(DATE_FORMAT);
}

function dateTimePartsToString(parts: DateTimeParts): string {
  const date = moment({
    year: parts.year,
    month: parts.month,
    date: parts.date,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: 0,
  });

  return date.format(DATE_TIME_FORMAT);
}

function stringToDateTimeParts(value: string): DateTimeParts | null {
  const dateTime = moment(value, [DATE_TIME_FORMAT, DATE_FORMAT]);
  if (!dateTime.isValid()) {
    return null;
  }

  return {
    year: dateTime.year(),
    month: dateTime.month(),
    date: dateTime.date(),
    hour: dateTime.hour(),
    minute: dateTime.minute(),
  };
}

function timePartsToString(value: TimeParts): string {
  const time = moment({
    hour: value.hour,
    minute: value.minute,
  });

  return time.format(TIME_FORMAT);
}

function stringToTimeParts(value: string): TimeParts | null {
  const time = moment(value, TIME_FORMAT);
  if (!time.isValid()) {
    return null;
  }

  return {
    hour: time.hour(),
    minute: time.minute(),
  };
}

function isSpecificDateOperator(operatorName: ExpressionOperatorName): boolean {
  switch (operatorName) {
    case "=":
    case ">":
    case "<":
    case "between":
      return true;
    default:
      return false;
  }
}

function isRelativeDateBucket(bucketName: string): bucketName is BucketName {
  switch (bucketName) {
    case "day":
    case "week":
    case "month":
    case "quarter":
    case "year":
      return true;
    default:
      return false;
  }
}

function relativeDateFilterPartsWithoutOffset(
  query: Query,
  stageIndex: number,
  { operator, args, options }: ExpressionParts,
): RelativeDateFilterParts | null {
  if (operator !== "time-interval" || args.length === 3) {
    return null;
  }

  const [column, value, bucketName] = args;
  if (
    !isColumnMetadata(column) ||
    !isDate(column) ||
    !isNumberOrCurrentLiteral(value) ||
    !isStringLiteral(bucketName) ||
    !isRelativeDateBucket(bucketName)
  ) {
    return null;
  }

  return {
    column,
    value,
    bucket: bucketName,
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

  const [offsetValue, offsetBucketName] = intervalParts.args;
  if (
    !isNumberLiteral(offsetValue) ||
    !isStringLiteral(offsetBucketName) ||
    !isRelativeDateBucket(offsetBucketName)
  ) {
    return null;
  }

  const [startValue, startBucketName] = startParts.args;
  const [endValue, endBucketName] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isStringLiteral(startBucketName) ||
    !isRelativeDateBucket(startBucketName) ||
    !isNumberLiteral(endValue) ||
    !isStringLiteral(endBucketName) ||
    !isRelativeDateBucket(endBucketName) ||
    startBucketName !== endBucketName ||
    (startValue !== 0 && endValue !== 0)
  ) {
    return null;
  }

  return {
    column,
    value: startValue < 0 ? startValue : endValue,
    bucket: startBucketName,
    offsetValue,
    offsetBucket: offsetBucketName,
    options,
  };
}

function isExcludeDateOperator(operatorName: ExpressionOperatorName): boolean {
  switch (operatorName) {
    case "!=":
    case "is-null":
    case "not-null":
      return true;
    default:
      return false;
  }
}

function isExcludeDateBucket(bucketName: BucketName): boolean {
  switch (bucketName) {
    case "hour-of-day":
    case "day-of-week":
    case "month-of-year":
    case "quarter-of-year":
      return true;
    default:
      return false;
  }
}

function excludeDatePartToString(
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
      date.month(value);
      break;
    case "quarter-of-year":
      date.quarter(value);
      break;
  }

  return date.format(DATE_FORMAT);
}

function stringToExcludeDatePart(
  value: string,
  bucketName: BucketName,
): number | null {
  const date = moment(value, DATE_FORMAT);
  if (!date.isValid()) {
    return null;
  }

  switch (bucketName) {
    case "hour-of-day":
      return date.hour();
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

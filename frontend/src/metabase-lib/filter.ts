import moment from "moment-timezone";
import * as ML from "cljs/metabase.lib.js";

import {
  temporalBucket,
  withTemporalBucket,
} from "metabase-lib/temporal_bucket";
import { expressionClause, expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import type {
  BooleanFilterParts,
  BucketName,
  ColumnMetadata,
  ExcludeDateFilterParts,
  ExpressionClause,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
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
  if (!isColumnMetadata(column) || !isStringLiteralArray(values)) {
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
  if (!isColumnMetadata(column) || !isNumberLiteralArray(values)) {
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
  if (!isColumnMetadata(column) || !isBooleanLiteralArray(values)) {
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
  return null;
}

export function isSpecificDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return specificDateFilterParts(query, stageIndex, filterClause) != null;
}

export function relativeDateFilterClause(
  query: Query,
  stageIndex: number,
  {
    column,
    value,
    bucket,
    offsetValue,
    offsetBucket,
    options,
  }: RelativeDateFilterParts,
): ExpressionClause {
  throw new TypeError();
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

export function excludeDateFilterClause(
  query: Query,
  stageIndex: number,
  { operator, column, values, bucket }: ExcludeDateFilterParts,
): ExpressionClause {
  const operatorInfo = displayInfo(query, stageIndex, operator);
  const columnWithBucket = withTemporalBucket(column, bucket);
  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const bucketValues = values.map(value =>
    excludeDatePartToDate(value, bucketInfo.shortName),
  );

  return expressionClause(operatorInfo.shortName, [
    columnWithBucket,
    ...bucketValues,
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

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isStringLiteralArray(values)) {
    return null;
  }

  const operator = findFilterOperator(query, stageIndex, column, operatorName);
  if (!operator) {
    return null;
  }

  const bucket = temporalBucket(column);
  if (!bucket) {
    return null;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const bucketValues = values.map(value =>
    excludeDateToDatePart(value, bucketInfo.shortName),
  );

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

export function timeFilterClause({
  operator,
  column,
  values,
}: TimeFilterParts): ExpressionClause {
  throw new TypeError();
}

export function timeFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): TimeFilterParts | null {
  return null;
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

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
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

const DATE_FORMAT = "yyyy-MM-dd";

function excludeDatePartToDate(value: number, bucketName: BucketName): string {
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
    default:
      date.utcOffset(value);
      break;
  }

  return date.format(DATE_FORMAT);
}

function excludeDateToDatePart(value: string, bucketName: BucketName): number {
  const date = moment(value, DATE_FORMAT);

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
      return date.utcOffset();
  }
}

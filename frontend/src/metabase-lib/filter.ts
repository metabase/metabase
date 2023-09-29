import * as ML from "cljs/metabase.lib.js";

import { isBoolean, isNumeric, isString } from "./column_types";
import { expressionClause, expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import type {
  BooleanFilterParts,
  BucketName,
  ColumnMetadata,
  ExcludeDateFilterParts,
  ExpressionClause,
  ExpressionParts,
  FilterClause,
  FilterOperator,
  FilterOperatorName,
  FilterParts,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
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

function isNumberOrCurrentLiteral(arg: unknown): arg is number | "current" {
  return arg === "current" || isNumberLiteral(arg);
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

function isExpression(arg: unknown): arg is ExpressionParts {
  return arg != null && typeof arg === "object";
}

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

function isFilterOperator(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  operatorName: string,
): operatorName is FilterOperatorName {
  return filterableColumnOperators(column).some(operator => {
    const operatorInfo = displayInfo(query, stageIndex, operator);
    return operatorInfo.shortName === operatorName;
  });
}

function isTemporalBucket(arg: unknown): arg is BucketName {
  return typeof arg === "string";
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
    !isColumnMetadata(column) ||
    !isString(column) ||
    !isStringLiteralArray(values) ||
    !isFilterOperator(query, stageIndex, column, operator)
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
    !isColumnMetadata(column) ||
    !isNumeric(column) ||
    !isNumberLiteralArray(values) ||
    !isFilterOperator(query, stageIndex, column, operator)
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
    !isColumnMetadata(column) ||
    !isBoolean(column) ||
    !isBooleanLiteralArray(values) ||
    !isFilterOperator(query, stageIndex, column, operator)
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
  return null;
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
    relativeDateFilterPartsWithoutOffset(filterParts) ??
    relativeDateFilterPartsWithOffset(filterParts)
  );
}

function relativeDateFilterPartsWithoutOffset({
  operator,
  args,
  options,
}: ExpressionParts): RelativeDateFilterParts | null {
  if (operator !== "time-interval" || args.length === 3) {
    return null;
  }

  const [column, value, bucket] = args;
  if (
    !isColumnMetadata(column) ||
    !isNumberOrCurrentLiteral(value) ||
    !isTemporalBucket(bucket)
  ) {
    return null;
  }

  return {
    column,
    value,
    bucket,
    options,
  };
}

function relativeDateFilterPartsWithOffset({
  operator,
  args,
  options,
}: ExpressionParts): RelativeDateFilterParts | null {
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
    !isExpression(intervalParts) ||
    intervalParts.operator !== "interval"
  ) {
    return null;
  }

  const [offsetValue, offsetBucket] = intervalParts.args;
  if (!isNumberLiteral(offsetValue) || !isTemporalBucket(offsetBucket)) {
    return null;
  }

  const [startValue, startBucket] = startParts.args;
  const [endValue, endBucket] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isTemporalBucket(startBucket) ||
    !isNumberLiteral(endValue) ||
    !isTemporalBucket(endBucket) ||
    startBucket !== endBucket ||
    (startValue !== 0 && endValue !== 0)
  ) {
    return null;
  }

  return {
    column,
    value: startValue < 0 ? startValue : endValue,
    bucket: startBucket,
    offsetValue,
    offsetBucket,
    options,
  };
}

export function isRelativeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return relativeDateFilterParts(query, stageIndex, filterClause) != null;
}

export function excludeDateFilterClause({
  operator,
  column,
  values,
  bucket,
}: ExcludeDateFilterParts): ExpressionClause {
  throw new TypeError();
}

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  return null;
}

export function isExcludeDateFilter(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): boolean {
  return excludeDateFilterParts(query, stageIndex, filterClause) != null;
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
    excludeDateFilterParts(query, stageIndex, filterClause)
  );
}

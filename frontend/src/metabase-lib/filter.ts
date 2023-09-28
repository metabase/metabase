import moment from "moment-timezone";
import * as ML from "cljs/metabase.lib.js";

import { expressionClause, expressionParts } from "./expression";
import type {
  BooleanFilterOperator,
  BooleanFilterParts,
  ColumnMetadata,
  ExcludeDateFilterParts,
  ExcludeTemporalUnit,
  ExpressionClause,
  ExpressionParts,
  FilterClause,
  FilterParts,
  NumberFilterOperator,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  RelativeTemporalUnit,
  SpecificDateFilterOperator,
  SpecificDateFilterParts,
  StringFilterOperator,
  StringFilterParts,
} from "./types";

export function filterableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.filterable_columns(query, stageIndex);
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

function isNumberOrCurrentLiteral(arg: unknown): arg is number | "current" {
  return arg === "current" || isNumberLiteral(arg);
}

function isBooleanLiteral(arg: unknown): arg is boolean {
  return typeof arg === "boolean";
}

function isBooleanLiteralArray(arg: unknown): arg is boolean[] {
  return Array.isArray(arg) && arg.every(isBooleanLiteral);
}

function isStringFilterOperator(arg: unknown): arg is StringFilterOperator {
  switch (arg) {
    case "=":
    case "!=":
    case "contains":
    case "does-not-contain":
    case "is-null":
    case "not-null":
    case "is-empty":
    case "not-empty":
    case "starts-with":
    case "ends-with":
      return true;
    default:
      return false;
  }
}

function isNumberFilterOperator(arg: unknown): arg is NumberFilterOperator {
  switch (arg) {
    case "=":
    case "!=":
    case ">":
    case "<":
    case "between":
    case ">=":
    case "<=":
    case "is-null":
    case "not-null":
      return true;
    default:
      return false;
  }
}

function isBooleanFilterOperator(arg: unknown): arg is BooleanFilterOperator {
  switch (arg) {
    case "=":
    case "is-null":
    case "not-null":
      return true;
    default:
      return false;
  }
}

function isSpecificDateFilterOperator(
  arg: unknown,
): arg is SpecificDateFilterOperator {
  switch (arg) {
    case "=":
    case "<":
    case ">":
    case "between":
      return true;
    default:
      return false;
  }
}

function isRelativeTemporalUnit(arg: unknown): arg is RelativeTemporalUnit {
  switch (arg) {
    case "minute":
    case "hour":
    case "day":
    case "week":
    case "quarter":
    case "month":
    case "year":
      return true;
    default:
      return false;
  }
}

function isExpression(arg: unknown): arg is ExpressionParts {
  return arg != null && typeof arg === "object";
}

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
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
  if (!isStringFilterOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isStringLiteralArray(values)) {
    return null;
  }

  return { operator, column, values, options };
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
  if (!isNumberFilterOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isNumberLiteralArray(values)) {
    return null;
  }

  return { operator, column, values };
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
  if (!isBooleanFilterOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isBooleanLiteralArray(values)) {
    return null;
  }

  return { operator, column, values };
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
  // TODO if values have time, we need to set "minute" temporal-unit on the column
  return expressionClause(operator, [column, ...values]);
}

export function specificDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): SpecificDateFilterParts | null {
  const { operator, args } = expressionParts(query, stageIndex, filterClause);
  if (!isSpecificDateFilterOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isStringLiteralArray(values)) {
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
  unit,
  offsetValue,
  offsetUnit,
  options,
}: RelativeDateFilterParts): ExpressionClause {
  if (offsetValue == null || offsetUnit == null) {
    return expressionClause("time-interval", [column, value, unit], options);
  }

  return expressionClause("between", [
    expressionClause("+", [
      column,
      expressionClause("interval", [-offsetValue, offsetUnit]),
    ]),
    expressionClause("relative-datetime", [value < 0 ? value : 0, offsetUnit]),
    expressionClause("relative-datetime", [value > 0 ? value : 0, offsetUnit]),
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

  const [column, value, unit] = args;
  if (
    !isColumnMetadata(column) ||
    !isNumberOrCurrentLiteral(value) ||
    !isRelativeTemporalUnit(unit)
  ) {
    return null;
  }

  return {
    column,
    value,
    unit,
    options,
  };
}

function relativeDateFilterPartsWithOffset({
  operator,
  args,
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

  const [offsetValue, offsetUnit] = intervalParts.args;
  if (!isNumberLiteral(offsetValue) || !isRelativeTemporalUnit(offsetUnit)) {
    return null;
  }

  const [startValue, startUnit] = startParts.args;
  const [endValue, endUnit] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isRelativeTemporalUnit(startUnit) ||
    !isNumberLiteral(endValue) ||
    !isRelativeTemporalUnit(endUnit) ||
    startUnit !== endUnit ||
    (startValue !== 0 && endValue !== 0)
  ) {
    return null;
  }

  return {
    column,
    value: startValue < 0 ? startValue : endValue,
    unit: startUnit,
    offsetValue,
    offsetUnit,
    options: {},
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
  unit,
}: ExcludeDateFilterParts): ExpressionClause {
  return expressionClause(operator, [
    column, // TODO set temporal-unit on the column
    ...values.map(value => excludeDateFilterClauseValue(value, unit)),
  ]);
}

function excludeDateFilterClauseValue(
  value: number,
  unit: ExcludeTemporalUnit,
): string {
  const date = moment();

  switch (unit) {
    case "day-of-week":
      date.isoWeekday(value);
      break;
    case "month-of-year":
      date.month(value);
      break;
    case "quarter-of-year":
      date.quarter(value);
      break;
    case "hour-of-day":
      date.hour(value);
      break;
  }

  return date.format("yyyy-MM-dd");
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

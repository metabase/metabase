import * as ML from "cljs/metabase.lib.js";

import {
  BOOLEAN_OPERATORS,
  NUMBER_OPERATORS,
  RELATIVE_DATE_UNITS,
  STRING_OPERATORS,
} from "./constants";
import { expressionClause, expressionParts } from "./expression";
import type {
  BooleanFilterParts,
  BooleanOperator,
  ColumnMetadata,
  ExcludeDateFilterParts,
  ExpressionClause,
  ExpressionParts,
  FilterClause,
  NumberFilterParts,
  NumberOperator,
  Query,
  RelativeDateFilterParts,
  RelativeDateUnit,
  StringFilterParts,
  StringOperator,
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

function isStringOperator(arg: unknown): arg is StringOperator {
  const operators: ReadonlyArray<string> = STRING_OPERATORS;
  return typeof arg === "string" && operators.includes(arg);
}

function isNumberOperator(arg: unknown): arg is NumberOperator {
  const operators: ReadonlyArray<string> = NUMBER_OPERATORS;
  return typeof arg === "string" && operators.includes(arg);
}

function isBooleanOperator(arg: unknown): arg is BooleanOperator {
  const operators: ReadonlyArray<string> = BOOLEAN_OPERATORS;
  return typeof arg === "string" && operators.includes(arg);
}

function isRelativeDateUnit(arg: unknown): arg is RelativeDateUnit {
  const units: ReadonlyArray<string> = RELATIVE_DATE_UNITS;
  return typeof arg === "string" && units.includes(arg);
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
  if (!isStringOperator(operator) || args.length < 1) {
    return null;
  }

  const [column, ...values] = args;
  if (!isColumnMetadata(column) || !isStringLiteralArray(values)) {
    return null;
  }

  return { operator, column, values, options };
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
  if (!isColumnMetadata(column) || !isNumberLiteralArray(values)) {
    return null;
  }

  return { operator, column, values };
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
  if (!isColumnMetadata(column) || !isBooleanLiteralArray(values)) {
    return null;
  }

  return { operator, column, values };
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
    !isRelativeDateUnit(unit)
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
  if (!isNumberLiteral(offsetValue) || !isRelativeDateUnit(offsetUnit)) {
    return null;
  }

  const [startValue, startUnit] = startParts.args;
  const [endValue, endUnit] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isRelativeDateUnit(startUnit) ||
    !isNumberLiteral(endValue) ||
    !isRelativeDateUnit(endUnit) ||
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

export function excludeDateFilterParts(
  query: Query,
  stageIndex: number,
  filterClause: FilterClause,
): ExcludeDateFilterParts | null {
  return null;
}

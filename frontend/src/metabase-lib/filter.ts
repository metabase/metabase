import * as ML from "cljs/metabase.lib.js";

import { TEMPORAL_UNITS } from "./constants";
import { expressionClause, expressionParts } from "./expression";
import type {
  BooleanFilterParts,
  ColumnMetadata,
  ExpressionClause,
  ExpressionParts,
  FilterClause,
  NumberFilterParts,
  Query,
  RelativeDateFilterParts,
  TemporalUnit,
  TextFilterParts,
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

export function textFilterClause({
  operator,
  column,
  values,
  options,
}: TextFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values], options);
}

export function numberFilterClause({
  operator,
  column,
  values,
}: NumberFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
}

export function booleanFilterClause({
  operator,
  column,
  values,
}: BooleanFilterParts): ExpressionClause {
  return expressionClause(operator, [column, ...values]);
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
  filter: FilterClause,
): RelativeDateFilterParts | null {
  const filterParts = expressionParts(query, stageIndex, filter);

  return (
    relativeDateFilterPartsWithoutOffset(filterParts) ??
    relativeDateFilterPartsWithOffset(filterParts)
  );
}

function isNumberLiteral(arg: unknown): arg is number {
  return typeof arg === "number";
}

function isNumberOrCurrentLiteral(arg: unknown): arg is number | "current" {
  return arg === "current" || isNumberLiteral(arg);
}

function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

function isTemporalUnit(arg: unknown): arg is TemporalUnit {
  const units: ReadonlyArray<string> = TEMPORAL_UNITS;
  return typeof arg === "string" && units.includes(arg);
}

function isExpression(arg: unknown): arg is ExpressionParts {
  return arg != null && typeof arg === "object";
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
    !isTemporalUnit(unit)
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
  if (!isNumberLiteral(offsetValue) || !isTemporalUnit(offsetUnit)) {
    return null;
  }

  const [startValue, startUnit] = startParts.args;
  const [endValue, endUnit] = endParts.args;
  if (
    !isNumberLiteral(startValue) ||
    !isTemporalUnit(startUnit) ||
    !isNumberLiteral(endValue) ||
    !isTemporalUnit(endUnit) ||
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

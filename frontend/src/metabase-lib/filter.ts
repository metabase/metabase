import * as ML from "cljs/metabase.lib.js";

import { isBoolean, isNumeric, isString } from "./column_types";
import { expressionClause, expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import type {
  BooleanFilterParts,
  ColumnMetadata,
  ExcludeDateFilterParts,
  ExpressionClause,
  FilterClause,
  FilterOperator,
  FilterParts,
  NumberFilterParts,
  Query,
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

function findFilterOperator(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  operatorName: string,
): FilterOperator | null {
  const operator = filterableColumnOperators(column).find(operator => {
    const operatorInfo = displayInfo(query, stageIndex, operator);
    return operatorInfo.shortName === operatorName;
  });

  return operator ?? null;
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
  const filterParts = expressionParts(query, stageIndex, filterClause);
  if (filterParts.args.length < 1) {
    return null;
  }

  const [column, ...values] = filterParts.args;
  if (
    !isColumnMetadata(column) ||
    !isString(column) ||
    !isStringLiteralArray(values)
  ) {
    return null;
  }

  const operator = findFilterOperator(
    query,
    stageIndex,
    column,
    filterParts.operator,
  );
  if (!operator) {
    return null;
  }

  return {
    column,
    operator,
    values,
    options: filterParts.options,
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
  const filterParts = expressionParts(query, stageIndex, filterClause);
  if (filterParts.args.length < 1) {
    return null;
  }

  const [column, ...values] = filterParts.args;
  if (
    !isColumnMetadata(column) ||
    !isNumeric(column) ||
    !isNumberLiteralArray(values)
  ) {
    return null;
  }

  const operator = findFilterOperator(
    query,
    stageIndex,
    column,
    filterParts.operator,
  );
  if (!operator) {
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
  const filterParts = expressionParts(query, stageIndex, filterClause);
  if (filterParts.args.length < 1) {
    return null;
  }

  const [column, ...values] = filterParts.args;
  if (
    !isColumnMetadata(column) ||
    !isBoolean(column) ||
    !isBooleanLiteralArray(values)
  ) {
    return null;
  }

  const operator = findFilterOperator(
    query,
    stageIndex,
    column,
    filterParts.operator,
  );
  if (!operator) {
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
    excludeDateFilterParts(query, stageIndex, filterClause)
  );
}

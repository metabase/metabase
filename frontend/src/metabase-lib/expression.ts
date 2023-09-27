import * as ML from "cljs/metabase.lib.js";
import { TEMPORAL_UNITS } from "./constants";
import type {
  ColumnMetadata,
  ExpressionArg,
  ExpressionClause,
  ExpressionOperator,
  ExpressionOptions,
  ExpressionParts,
  FilterClause,
  Query,
  TemporalUnit,
} from "./types";

export function expression(
  query: Query,
  stageIndex: number,
  expressionName: string,
  clause: ExpressionClause,
): Query {
  return ML.expression(query, stageIndex, expressionName, clause);
}

export function expressions(
  query: Query,
  stageIndex: number,
): ExpressionClause[] {
  return ML.expressions(query, stageIndex);
}

export function expressionableColumns(
  query: Query,
  stageIndex: number,
  expressionPosition: number,
): ColumnMetadata[] {
  return ML.expressionable_columns(query, stageIndex, expressionPosition);
}

export function expressionParts(
  query: Query,
  stageIndex: number,
  clause: ExpressionClause | FilterClause,
): ExpressionParts {
  return ML.expression_parts(query, stageIndex, clause);
}

export function expressionClause(
  operator: ExpressionOperator,
  options: ExpressionOptions | null,
  args: (ExpressionArg | ExpressionClause)[],
): ExpressionClause {
  return ML.expression_clause(operator, options, args);
}

export function isColumnMetadata(
  arg: ExpressionArg | ExpressionParts,
): arg is ColumnMetadata {
  return typeof arg === "object";
}

export function isStringLiteral(
  arg: ExpressionArg | ExpressionParts,
): arg is string {
  return typeof arg === "string";
}

export function isNumberLiteral(
  arg: ExpressionArg | ExpressionParts,
): arg is number {
  return typeof arg === "number";
}

export function isNumberLiteralOrCurrent(
  arg: ExpressionArg | ExpressionParts,
): arg is number | "current" {
  return arg === "current" || isNumberLiteral(arg);
}

export function isTemporalUnit(
  arg: ExpressionArg | ExpressionParts,
): arg is TemporalUnit {
  const units: ReadonlyArray<string> = TEMPORAL_UNITS;
  return typeof arg === "string" && units.includes(arg);
}

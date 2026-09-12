import * as ML from "cljs/metabase.lib.js";

import type {
  AggregationClause,
  ColumnMetadata,
  ExpressionArg,
  ExpressionClause,
  ExpressionOperator,
  ExpressionOptions,
  ExpressionParts,
  FilterClause,
  JoinCondition,
  Query,
} from "./types";

type ErrorWithMessage = {
  message: string;
  friendly?: boolean;
};

export function expression(
  query: Query,
  stageIndex: number,
  expressionName: string,
  clause: ExpressionClause,
): Query {
  return ML.expression(query, stageIndex, expressionName, clause);
}

export function withExpressionName<
  Clause extends AggregationClause | ExpressionClause,
>(clause: Clause, newName: string): Clause {
  return ML.with_expression_name(clause, newName);
}

export function expressions(
  query: Query,
  stageIndex: number,
): ExpressionClause[] {
  return ML.expressions(query, stageIndex);
}

export function expressionableColumns(
  query: Query,
  stageIndex?: number,
  expressionIndex?: number,
): ColumnMetadata[] {
  return ML.expressionable_columns(query, stageIndex, expressionIndex);
}

export function expressionParts(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | FilterClause | JoinCondition,
): ExpressionParts;
export function expressionParts(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause | FilterClause | JoinCondition,
): ExpressionParts | ExpressionArg;
export function expressionParts(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause | FilterClause | JoinCondition,
): ExpressionParts | ExpressionArg {
  const parts = ML.expression_parts(query, stageIndex, clause);
  if (parts == null) {
    throw new TypeError("Expected expression_parts to return a value");
  }
  if (isExpressionParts(parts) || isExpressionArg(parts)) {
    return parts;
  }
  throw new TypeError("Expected expression_parts to return an expression");
}

function isExpressionParts(value: unknown): value is ExpressionParts {
  return (
    typeof value === "object" &&
    value != null &&
    "operator" in value &&
    typeof value.operator === "string" &&
    "args" in value &&
    Array.isArray(value.args) &&
    value.args.every(isExpressionArg)
  );
}

function isExpressionArg(value: unknown): value is ExpressionArg {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    (typeof value === "object" && value != null)
  );
}

export function expressionClause(
  parts: ExpressionParts | ExpressionArg,
): ExpressionClause;
export function expressionClause(
  operator: ExpressionOperator,
  args: (
    | ExpressionParts
    | ExpressionArg
    | AggregationClause
    | ExpressionClause
    | FilterClause
  )[],
  options?: ExpressionOptions | null,
): ExpressionClause;
export function expressionClause(
  operatorOrParts: ExpressionOperator | ExpressionParts | ExpressionArg,
  args?: (
    | ExpressionParts
    | ExpressionArg
    | AggregationClause
    | ExpressionClause
    | FilterClause
  )[],
  options?: ExpressionOptions | null,
): ExpressionClause {
  if (args === undefined && options === undefined) {
    return ML.expression_clause(operatorOrParts);
  }
  return ML.expression_clause(operatorOrParts, args, options ?? null);
}

export type ExpressionMode = "expression" | "aggregation" | "filter";
export function diagnoseExpression(
  query: Query,
  stageIndex: number,
  expressionMode: ExpressionMode,
  expression: ExpressionClause,
  expressionIndex?: number,
): ErrorWithMessage | null {
  return ML.diagnose_expression(
    query,
    stageIndex,
    expressionMode,
    expression,
    expressionIndex,
  );
}

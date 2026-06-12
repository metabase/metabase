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
  T extends AggregationClause | ExpressionClause,
>(clause: T, newName: string): T {
  return ML.with_expression_name(clause, newName);
}

export function expressions(
  query: Query,
  stageIndex: number,
): ExpressionClause[] {
  return ML.expressions(query, stageIndex) || [];
}

export function expressionableColumns(
  query: Query,
  stageIndex: number = -1,
  expressionIndex?: number,
): ColumnMetadata[] {
  return ML.expressionable_columns(query, stageIndex, expressionIndex) || [];
}

// Aggregation, filter, and join-condition clauses always destructure into a parts
// object. A bare expression clause can also be a literal (e.g. a standalone string
// expression), which expression_parts returns as-is.
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
  if (!isExpressionPartsLike(parts)) {
    throw new TypeError("Expected expression_parts to return a value");
  }
  return parts;
}

// Intentionally shallow: expression_parts returns a parts object for function
// clauses, a bare literal for literal expressions, and opaque metadata values for
// unresolved references ("[Unknown Field]" etc.), which the expression formatter
// renders downstream. Only null/undefined indicates a bug.
function isExpressionPartsLike(
  parts: unknown,
): parts is ExpressionParts | ExpressionArg {
  return parts != null;
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

import * as ML from "cljs/metabase.lib.js";
import type {
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
  clause: ExpressionClause | FilterClause | JoinCondition,
): ExpressionParts {
  return ML.expression_parts(query, stageIndex, clause);
}

export function expressionClause(
  operator: ExpressionOperator,
  args: (ExpressionArg | ExpressionClause)[],
  options: ExpressionOptions | null = null,
): ExpressionClause {
  return ML.expression_clause(operator, args, options);
}

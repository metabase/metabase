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

export function expression(
  query: Query,
  stageIndex: number,
  expressionName: string,
  clause: ExpressionClause,
): Query {
  return ML.expression(query, stageIndex, expressionName, clause);
}

export function expressionName(clause: ExpressionClause): string {
  return ML.expression_name(clause);
}

export function withExpressionName(
  clause: ExpressionClause,
  newName: string,
): ExpressionClause {
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

export function expressionClauseForLegacyExpression(
  query: Query,
  stageIndex: number,
  mbql: any,
): ExpressionClause {
  return ML.expression_clause_for_legacy_expression(query, stageIndex, mbql);
}

export function legacyExpressionForExpressionClause(
  query: Query,
  stageIndex: number,
  expressionClause: ExpressionClause | AggregationClause | FilterClause,
): any {
  return ML.legacy_expression_for_expression_clause(
    query,
    stageIndex,
    expressionClause,
  );
}

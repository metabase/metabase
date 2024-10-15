import { expressionClause } from "./expression";
import type { AggregationClause, ExpressionClause } from "./types";

export function offsetClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  return expressionClause("offset", [clause, offset]);
}

export function diffOffsetClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  return expressionClause("-", [
    clause,
    expressionClause("offset", [clause, offset]),
  ]);
}

export function percentDiffOffsetClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  return expressionClause("-", [
    expressionClause("/", [
      clause,
      expressionClause("offset", [clause, offset]),
    ]),
    1,
  ]);
}

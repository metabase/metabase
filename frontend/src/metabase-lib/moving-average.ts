import { expressionClause } from "./expression";
import type { AggregationClause, ExpressionClause } from "./types";

function movingAverage({
  clause,
  offset,
  start,
}: {
  clause: AggregationClause | ExpressionClause;
  offset: number;
  start: number;
}) {
  const clauses = [];
  for (let i = 0; i > offset; i--) {
    const period = start + i;

    if (period === 0) {
      clauses.push(clause);
    } else {
      clauses.push(expressionClause("offset", [clause, period]));
    }
  }

  return expressionClause("/", [
    expressionClause("+", clauses),
    Math.abs(offset),
  ]);
}

export function movingAverageClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  return movingAverage({ clause, offset, start });
}

export function diffMovingAverageClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  const average = movingAverage({ clause, offset, start });
  return expressionClause("-", [clause, average]);
}

export function percentDiffMovingAverageClause(
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  const average = movingAverage({ clause, offset, start });
  return expressionClause("/", [clause, average]);
}

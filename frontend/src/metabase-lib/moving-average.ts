import { t } from "ttag";

import { breakoutColumn, breakouts } from "./breakout";
import { isTemporal } from "./column_types";
import { expressionClause, withExpressionName } from "./expression";
import { describeTemporalUnit, displayInfo } from "./metadata";
import { temporalBucket } from "./temporal_bucket";
import type { AggregationClause, ExpressionClause, Query } from "./types";

function movingAverage(
  clause: AggregationClause | ExpressionClause,
  offset: number,
  start: number,
) {
  const clauses = [];
  for (let i = 0; i > offset; i--) {
    const period = start + i;

    if (period === 0) {
      clauses.push(clause);
    } else {
      clauses.push(expressionClause("offset", [clause, period]));
    }
  }

  const newClause = expressionClause("/", [
    expressionClause("+", clauses),
    Math.abs(offset),
  ]);

  return newClause;
}

export function movingAverageClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  const newClause = movingAverage(clause, offset, start);

  const newName = getMovingAverageClauseName(
    query,
    stageIndex,
    clause,
    offset,
    "",
  );

  return withExpressionName(newClause, newName);
}

export function diffMovingAverageClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  const average = movingAverage(clause, offset, start);
  const newClause = expressionClause("-", [clause, average]);

  const newName = getMovingAverageClauseName(
    query,
    stageIndex,
    clause,
    offset,
    t`vs `,
  );

  return withExpressionName(newClause, newName);
}

export function percentDiffMovingAverageClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
  includeCurrentPeriod: boolean,
): ExpressionClause {
  const start = includeCurrentPeriod ? 0 : -1;
  const average = movingAverage(clause, offset, start);
  const newClause = expressionClause("/", [clause, average]);

  const newName = getMovingAverageClauseName(
    query,
    stageIndex,
    clause,
    offset,
    t`% vs `,
  );

  return withExpressionName(newClause, newName);
}

function getMovingAverageClauseName(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
  prefix = "",
) {
  if (offset >= 0) {
    throw new Error(
      "non-negative offset values aren't supported in 'getAverageClauseName'",
    );
  }
  const absoluteOffset = Math.abs(offset);
  const { displayName } = displayInfo(query, stageIndex, clause);
  const firstBreakout = breakouts(query, stageIndex)[0];

  if (!firstBreakout) {
    return t`${displayName} (${prefix}${absoluteOffset}-period moving average)`;
  }

  const firstBreakoutColumn = breakoutColumn(query, stageIndex, firstBreakout);

  if (!isTemporal(firstBreakoutColumn)) {
    return t`${displayName} (${prefix}${absoluteOffset}-row moving average)`;
  }

  const bucket = temporalBucket(firstBreakout);

  if (!bucket) {
    return t`${displayName} (${prefix}${absoluteOffset}-period moving average)`;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const period = describeTemporalUnit(bucketInfo.shortName, 1).toLowerCase();

  return t`${displayName} (${prefix}${absoluteOffset}-${period} moving average)`;
}

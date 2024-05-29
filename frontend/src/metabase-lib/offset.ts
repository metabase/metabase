import { t } from "ttag";

import { inflect } from "metabase/lib/formatting";

import { breakoutColumn, breakouts } from "./breakout";
import { isDate } from "./column_types";
import { expressionClause, withExpressionName } from "./expression";
import { displayInfo } from "./metadata";
import { temporalBucket } from "./temporal_bucket";
import type { AggregationClause, ExpressionClause, Query } from "./types";

export function offsetClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  const newName = getOffsetClauseName(query, stageIndex, clause, offset);
  const newClause = expressionClause("offset", [clause, offset]);
  return withExpressionName(newClause, newName);
}

export function diffOffsetClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  const newName = getOffsetClauseName(
    query,
    stageIndex,
    clause,
    offset,
    t`vs `,
  );
  const newClause = expressionClause("-", [
    clause,
    expressionClause("offset", [clause, offset]),
  ]);
  return withExpressionName(newClause, newName);
}

export function percentDiffOffsetClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
): ExpressionClause {
  const newName = getOffsetClauseName(
    query,
    stageIndex,
    clause,
    offset,
    t`% vs `,
  );
  const newClause = expressionClause("-", [
    expressionClause("/", [
      clause,
      expressionClause("offset", [clause, offset]),
    ]),
    1,
  ]);
  return withExpressionName(newClause, newName);
}

function getOffsetClauseName(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause,
  offset: number,
  prefix = "",
): string {
  if (offset >= 0) {
    throw new Error(
      "non-negative offset values aren't supported in 'getOffsetClauseName'",
    );
  }

  const absoluteOffset = Math.abs(offset);
  const { displayName } = displayInfo(query, stageIndex, clause);
  const firstBreakout = breakouts(query, stageIndex)[0];

  if (!firstBreakout) {
    return absoluteOffset === 1
      ? t`${displayName} (${prefix}previous period)`
      : t`${displayName} (${prefix}${absoluteOffset} periods ago)`;
  }

  const firstBreakoutColumn = breakoutColumn(query, stageIndex, firstBreakout);

  if (!isDate(firstBreakoutColumn)) {
    return absoluteOffset === 1
      ? t`${displayName} (${prefix}previous value)`
      : t`${displayName} (${prefix}${absoluteOffset} rows above)`;
  }

  const bucket = temporalBucket(firstBreakout);

  if (!bucket) {
    return absoluteOffset === 1
      ? t`${displayName} (${prefix}previous period)`
      : t`${displayName} (${prefix}${absoluteOffset} periods ago)`;
  }

  const bucketInfo = displayInfo(query, stageIndex, bucket);
  const bucketName = bucketInfo.displayName.toLowerCase();
  const period = inflect(bucketName, absoluteOffset);

  return absoluteOffset === 1
    ? t`${displayName} (${prefix}previous ${period})`
    : t`${displayName} (${prefix}${absoluteOffset} ${period} ago)`;
}

import type * as Lib from "metabase-lib";

export function updateTemporalBucketing(
  query: Lib.Query,
  _stageIndex: number,
  _condition: Lib.JoinCondition,
  _expressions: Lib.ExpressionClause[],
) {
  return query;

  // const bucket =
  //   expressions
  //     .map((expression) => Lib.temporalBucket(expression))
  //     .find((bucket) => bucket != null) ?? null;
  //
  // return Lib.joinConditionUpdateTemporalBucketing(
  //   query,
  //   stageIndex,
  //   condition,
  //   bucket,
  // );
}

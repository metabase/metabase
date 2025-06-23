import type * as Lib from "metabase-lib";

export function updateTemporalBucketing(
  _query: Lib.Query,
  _stageIndex: number,
  condition: Lib.JoinCondition,
  _expressions: Lib.ExpressionClause[],
) {
  return condition;

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

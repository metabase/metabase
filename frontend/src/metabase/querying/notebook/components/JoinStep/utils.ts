import * as Lib from "metabase-lib";

export function updateTemporalBucketing(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  expressions: Lib.ExpressionClause[],
) {
  const bucket =
    expressions
      .map((expression) => Lib.temporalBucket(expression))
      .find((bucket) => bucket != null) ?? null;

  return Lib.joinConditionUpdateTemporalBucketing(
    query,
    stageIndex,
    condition,
    bucket,
  );
}

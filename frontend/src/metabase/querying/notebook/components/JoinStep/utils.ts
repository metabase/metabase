import * as Lib from "metabase-lib";

export function updateTemporalBucketing(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  bucket: Lib.Bucket | null,
) {
  return Lib.joinConditionUpdateTemporalBucketing(
    query,
    stageIndex,
    condition,
    bucket,
  );
}

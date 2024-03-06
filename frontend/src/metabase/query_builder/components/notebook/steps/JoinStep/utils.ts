import * as Lib from "metabase-lib";

export function maybeSyncTemporalBucket(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  column1: Lib.ColumnMetadata,
  column2: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(column1) ?? Lib.temporalBucket(column2);
  if (bucket) {
    return Lib.joinConditionUpdateTemporalBucketing(
      query,
      stageIndex,
      condition,
      bucket,
    );
  }

  return condition;
}

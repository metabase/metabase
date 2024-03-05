import * as Lib from "metabase-lib";

export function maybeSyncTemporalBucket(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  newColumn: Lib.ColumnMetadata,
  oldColumn: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(newColumn) ?? Lib.temporalBucket(oldColumn);
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

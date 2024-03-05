import * as Lib from "metabase-lib";

export function maybeSyncTemporalUnit(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  lhsColumn: Lib.ColumnMetadata,
  rhsColumn: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(lhsColumn) ?? Lib.temporalBucket(rhsColumn);
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

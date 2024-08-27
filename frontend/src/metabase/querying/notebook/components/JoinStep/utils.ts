import * as Lib from "metabase-lib";

export function updateTemporalBucketing(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinCondition,
  columns: Lib.ColumnMetadata[],
) {
  const bucket =
    columns
      .map(column => Lib.temporalBucket(column))
      .find(bucket => bucket != null) ?? null;

  return Lib.joinConditionUpdateTemporalBucketing(
    query,
    stageIndex,
    condition,
    bucket,
  );
}

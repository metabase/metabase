import * as Lib from "metabase-lib";

export function getBreakoutColumns(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata[] {
  return Lib.breakoutableColumns(query, stageIndex).filter(column =>
    Lib.isTemporalBucketable(query, stageIndex, column),
  );
}

export function getBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata {
  const columns = getBreakoutColumns(query, stageIndex);
  return columns[0];
}

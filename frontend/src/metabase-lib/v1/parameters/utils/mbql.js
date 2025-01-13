import * as Lib from "metabase-lib";

export function applyTemporalUnitParameter(query, stageIndex, parameter) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const columns = breakouts.map(breakout =>
    Lib.breakoutColumn(query, stageIndex, breakout),
  );
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [parameter.target[1]],
  );
  if (columnIndex < 0) {
    return query;
  }

  const column = columns[columnIndex];
  const breakout = breakouts[columnIndex];
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  const bucket = buckets.find(
    bucket =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === parameter.value,
  );
  if (!bucket) {
    return query;
  }

  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  return Lib.replaceClause(query, stageIndex, breakout, columnWithBucket);
}

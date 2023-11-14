import * as Lib from "metabase-lib";

export function getMenuItem(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
) {
  return {
    bucket,
    ...Lib.displayInfo(query, stageIndex, bucket),
  };
}

export function getSelectedItem(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(column);
  return bucket ? getMenuItem(query, stageIndex, bucket) : undefined;
}

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  return buckets.map(bucket => getMenuItem(query, stageIndex, bucket));
}

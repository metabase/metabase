import * as Lib from "metabase-lib";

export function getOption(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
) {
  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
  return {
    value: bucketInfo.shortName,
    label: bucketInfo.displayName,
    bucket,
  };
}

export function getSelectedOption(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(column);
  return bucket ? getOption(query, stageIndex, bucket) : undefined;
}

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  return buckets.map(bucket => getOption(query, stageIndex, bucket));
}

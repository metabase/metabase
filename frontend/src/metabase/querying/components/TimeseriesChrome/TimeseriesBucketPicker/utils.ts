import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { BucketItem } from "./types";

export function getBucketItem(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
): BucketItem {
  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
  return {
    name: bucketInfo.displayName,
    bucket,
  };
}

export function getSelectedItem(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const bucket = Lib.temporalBucket(column);
  return bucket
    ? getBucketItem(query, stageIndex, bucket)
    : { name: t`Unbinned`, bucket: null };
}

export function getAvailableItems(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(bucket => getBucketItem(query, stageIndex, bucket))
    .concat({ name: t`Don't bin`, bucket: null });
}

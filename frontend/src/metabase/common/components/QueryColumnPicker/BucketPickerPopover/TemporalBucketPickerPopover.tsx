import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { BucketPickerPopoverProps } from "./types";
import type { BucketListItem } from "./BaseBucketPickerPopover";
import {
  BaseBucketPickerPopover,
  getBucketListItem,
} from "./BaseBucketPickerPopover";

function checkBucketIsSelected(item: BucketListItem) {
  return !!item.selected;
}

export function TemporalBucketPickerPopover({
  query,
  stageIndex,
  column,
  buckets,
  onSelect,
  ...props
}: BucketPickerPopoverProps) {
  const selectedBucket = useMemo(() => Lib.temporalBucket(column), [column]);

  const items = useMemo(
    () => buckets.map(bucket => getBucketListItem(query, stageIndex, bucket)),
    [query, stageIndex, buckets],
  );

  const handleBucketSelect = useCallback(
    (bucket: Lib.Bucket | null) => {
      onSelect(Lib.withTemporalBucket(column, bucket));
    },
    [column, onSelect],
  );

  return (
    <BaseBucketPickerPopover
      {...props}
      query={query}
      stageIndex={stageIndex}
      items={items}
      selectedBucket={selectedBucket}
      triggerLabel={t`Temporal bucket`}
      checkBucketIsSelected={checkBucketIsSelected}
      renderTriggerContent={renderTriggerContent}
      onSelect={handleBucketSelect}
    />
  );
}

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? t`by ${bucket.displayName.toLowerCase()}` : null;
}

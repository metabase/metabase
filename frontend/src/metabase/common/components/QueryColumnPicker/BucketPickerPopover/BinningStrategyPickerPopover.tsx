import { useCallback, useMemo } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { BucketListItem } from "./BaseBucketPickerPopover";
import {
  BaseBucketPickerPopover,
  getBucketListItem,
} from "./BaseBucketPickerPopover";
import type { CommonBucketPickerProps } from "./types";

export function BinningStrategyPickerPopover({
  query,
  stageIndex,
  column,
  buckets,
  isEditing,
  onSelect,
  ...props
}: CommonBucketPickerProps) {
  const selectedBucket = useMemo(() => Lib.binning(column), [column]);

  const items = useMemo(
    () => [
      ...buckets.map(bucket => getBucketListItem(query, stageIndex, bucket)),
      { displayName: t`Don't bin`, bucket: null },
    ],
    [query, stageIndex, buckets],
  );

  const handleBucketSelect = useCallback(
    (bucket: Lib.Bucket | null) => {
      onSelect(Lib.withBinning(column, bucket));
    },
    [column, onSelect],
  );

  const checkBucketIsSelected = useCallback(
    (item: BucketListItem) => {
      // `bucket: null` represents the "Don't bin" option
      // It's considered selected when editing an existing clause without a binning strategy
      if (item.bucket === null) {
        return !selectedBucket && isEditing;
      }
      return !!item.selected;
    },
    [selectedBucket, isEditing],
  );

  return (
    <BaseBucketPickerPopover
      {...props}
      query={query}
      stageIndex={stageIndex}
      items={items}
      selectedBucket={selectedBucket}
      isEditing={isEditing}
      triggerLabel={t`Binning strategy`}
      checkBucketIsSelected={checkBucketIsSelected}
      renderTriggerContent={renderTriggerContent}
      onSelect={handleBucketSelect}
    />
  );
}

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? bucket.displayName : t`Unbinned`;
}

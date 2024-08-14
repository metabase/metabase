import { useCallback, useMemo } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { BucketListItem } from "./BaseBucketPickerPopover";
import {
  BaseBucketPickerPopover,
  getBucketListItem,
} from "./BaseBucketPickerPopover";
import type { CommonBucketPickerProps } from "./types";

function checkBucketIsSelected(item: BucketListItem) {
  return !!item.selected;
}

export function TemporalBucketPickerPopover({
  query,
  stageIndex,
  column,
  buckets,
  isEditing,
  onSelect,
  ...props
}: CommonBucketPickerProps) {
  const selectedBucket = useMemo(() => Lib.temporalBucket(column), [column]);

  const items = useMemo(
    () => [
      ...buckets.map(bucket => getBucketListItem(query, stageIndex, bucket)),
      {
        displayName: t`Don't bin`,
        bucket: null,
        selected: !selectedBucket && isEditing,
      },
    ],
    [buckets, selectedBucket, isEditing, query, stageIndex],
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
      isEditing={isEditing}
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
  return bucket ? t`by ${bucket.displayName.toLowerCase()}` : t`Unbinned`;
}

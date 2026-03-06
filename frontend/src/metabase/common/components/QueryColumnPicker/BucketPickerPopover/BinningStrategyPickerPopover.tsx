import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  type BucketPickerItem,
  BucketPickerPopover,
} from "metabase/common/components/BucketPickerPopover";
import * as Lib from "metabase-lib";

import type { CommonBucketPickerProps } from "./types";

const INITIALLY_VISIBLE_ITEMS_COUNT = 5;

function getBucketPickerItem(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
): BucketPickerItem {
  const info = Lib.displayInfo(query, stageIndex, bucket);
  return {
    displayName: info.displayName,
    isDefault: info.default,
    isSelected: info.selected,
  };
}

export function BinningStrategyPickerPopover({
  query,
  stageIndex,
  column,
  buckets,
  isEditing,
  onSelect,
  hasChevronDown,
  color,
  className,
  classNames,
}: CommonBucketPickerProps) {
  const selectedBucket = useMemo(() => Lib.binning(column), [column]);

  const items: BucketPickerItem[] = useMemo(
    () => [
      ...buckets.map((bucket) =>
        getBucketPickerItem(query, stageIndex, bucket),
      ),
      {
        displayName: t`Don't bin`,
        isSelected: !selectedBucket && isEditing,
      },
    ],
    [query, stageIndex, buckets, selectedBucket, isEditing],
  );

  const triggerLabel = useMemo(() => {
    const displayBucket = isEditing
      ? selectedBucket
      : buckets.find((bucket) => {
          const info = Lib.displayInfo(query, stageIndex, bucket);
          return info.default;
        });
    if (displayBucket) {
      return Lib.displayInfo(query, stageIndex, displayBucket).displayName;
    }
    return t`Unbinned`;
  }, [query, stageIndex, isEditing, selectedBucket, buckets]);

  const handleSelect = useCallback(
    (index: number) => {
      const bucket: Lib.Bucket | null =
        index < buckets.length ? buckets[index] : null;
      onSelect(Lib.withBinning(column, bucket));
    },
    [column, buckets, onSelect],
  );

  return (
    <BucketPickerPopover
      triggerLabel={triggerLabel}
      ariaLabel={t`Binning strategy`}
      items={items}
      onSelect={handleSelect}
      initiallyVisibleItemsCount={INITIALLY_VISIBLE_ITEMS_COUNT}
      color={color}
      hasChevronDown={hasChevronDown}
      className={className}
      classNames={classNames}
    />
  );
}

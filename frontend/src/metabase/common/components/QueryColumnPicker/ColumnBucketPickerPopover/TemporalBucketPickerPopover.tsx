import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  type BucketItem,
  BucketPickerPopover,
} from "metabase/common/components/BucketPickerPopover";
import * as Lib from "metabase-lib";

import type { CommonBucketPickerProps } from "./types";

export const INITIALLY_VISIBLE_ITEMS_COUNT = 7;

function getBucketItem(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
): BucketItem {
  const info = Lib.displayInfo(query, stageIndex, bucket);
  return {
    displayName: info.displayName,
    isDefault: info.default,
    isSelected: info.selected,
  };
}

export function TemporalBucketPickerPopover({
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
  const selectedBucket = useMemo(() => Lib.temporalBucket(column), [column]);
  const isExplicitlyUnbucketed = useMemo(
    () =>
      selectedBucket != null &&
      Lib.displayInfo(query, stageIndex, selectedBucket).shortName ===
        "default",
    [query, stageIndex, selectedBucket],
  );

  const items: BucketItem[] = useMemo(
    () => [
      ...buckets.map((bucket) => getBucketItem(query, stageIndex, bucket)),
      {
        displayName: t`Don't bin`,
        isSelected: isEditing && (isExplicitlyUnbucketed || !selectedBucket),
      },
    ],
    [
      buckets,
      selectedBucket,
      isExplicitlyUnbucketed,
      isEditing,
      query,
      stageIndex,
    ],
  );

  const triggerLabel = useMemo(() => {
    const displayBucket =
      isEditing && !isExplicitlyUnbucketed
        ? selectedBucket
        : !isEditing
          ? buckets.find((bucket) => {
              const info = Lib.displayInfo(query, stageIndex, bucket);
              return info.default;
            })
          : undefined;
    if (displayBucket) {
      const info = Lib.displayInfo(query, stageIndex, displayBucket);
      return t`by ${info.displayName.toLowerCase()}`;
    }
    return t`Unbinned`;
  }, [
    query,
    stageIndex,
    isEditing,
    isExplicitlyUnbucketed,
    selectedBucket,
    buckets,
  ]);

  const handleSelect = useCallback(
    (item: BucketItem) => {
      const index = items.indexOf(item);
      const bucket = buckets.at(index);
      onSelect(Lib.withTemporalBucket(column, bucket ?? "default"));
    },
    [column, items, buckets, onSelect],
  );

  return (
    <BucketPickerPopover
      triggerLabel={triggerLabel}
      ariaLabel={t`Temporal bucket`}
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

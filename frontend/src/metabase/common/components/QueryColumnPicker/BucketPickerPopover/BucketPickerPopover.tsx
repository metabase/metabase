import React, { useCallback, useMemo } from "react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import * as Lib from "metabase-lib";
import {
  TriggerButton,
  TriggerIcon,
  SelectList,
  SelectListItem,
} from "./BucketPickerPopover.styled";

export interface BucketPickerPopoverProps {
  query: Lib.Query;
  selectedBucket?: Lib.Bucket | null;
  buckets: Lib.Bucket[];
  withDefaultBucket?: boolean;
  triggerLabel?: string;
  renderTriggerContent: (bucket?: Lib.BucketDisplayInfo) => void;
  onSelect: (item: Lib.Bucket) => void;
}

type ListItem = Lib.BucketDisplayInfo & {
  bucket: Lib.Bucket;
};

export function BucketPickerPopover({
  selectedBucket,
  query,
  buckets,
  withDefaultBucket = true,
  triggerLabel,
  renderTriggerContent,
  onSelect,
}: BucketPickerPopoverProps) {
  const displayableItems: ListItem[] = useMemo(
    () =>
      buckets.map(bucket => ({
        ...Lib.displayInfo(query, bucket),
        bucket,
      })),
    [query, buckets],
  );

  const defaultBucket = useMemo(
    () => displayableItems.find(item => item.default),
    [displayableItems],
  );

  const checkIsBucketSelected = useCallback(
    (item: ListItem) => {
      if (!selectedBucket && withDefaultBucket) {
        return false;
      }
      return Lib.isSameBucket(query, item.bucket, selectedBucket);
    },
    [query, selectedBucket, withDefaultBucket],
  );

  const triggerContentBucket = useMemo(() => {
    if (selectedBucket) {
      return selectedBucket;
    }
    return withDefaultBucket ? defaultBucket?.bucket : undefined;
  }, [selectedBucket, withDefaultBucket, defaultBucket]);

  const triggerContentBucketDisplayInfo = triggerContentBucket
    ? Lib.displayInfo(query, triggerContentBucket)
    : undefined;

  return (
    <PopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <TriggerButton
          aria-label={triggerLabel}
          onClick={onClick}
          // Compat with E2E tests around MLv1-based components
          // Prefer using a11y role selectors
          data-testid="dimension-list-item-binning"
        >
          {renderTriggerContent(triggerContentBucketDisplayInfo)}
          <TriggerIcon name="chevronright" />
        </TriggerButton>
      )}
      popoverContent={
        <SelectList>
          {displayableItems.map(item => (
            <SelectListItem
              id={item.displayName}
              key={item.displayName}
              name={item.displayName}
              isSelected={checkIsBucketSelected(item)}
              onSelect={() => onSelect(item.bucket)}
            />
          ))}
        </SelectList>
      }
    />
  );
}

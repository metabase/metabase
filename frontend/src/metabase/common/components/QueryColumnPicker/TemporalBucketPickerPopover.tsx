import React, { useMemo } from "react";
import { t } from "ttag";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import * as Lib from "metabase-lib";
import {
  TriggerButton,
  TriggerIcon,
  SelectList,
  SelectListItem,
} from "./ColumnPrecisionPickerPopover.styled";

interface TemporalBucketPickerPopoverProps {
  selectedItem?: Lib.Bucket | null;
  query: Lib.Query;
  items: Lib.Bucket[];
  onSelect: (item: Lib.Bucket) => void;
}

type TemporalBucketListItem = Lib.BucketDisplayInfo & {
  temporalBucket: Lib.Bucket;
};

function TemporalBucketPickerPopover({
  selectedItem,
  query,
  items,
  onSelect,
}: TemporalBucketPickerPopoverProps) {
  const displayableItems: TemporalBucketListItem[] = useMemo(
    () =>
      items.map(temporalBucket => ({
        ...Lib.displayInfo(query, temporalBucket),
        temporalBucket,
      })),
    [query, items],
  );

  const defaultTemporalBucket = displayableItems.find(item => item.default);
  const activeTemporalBucket =
    selectedItem || defaultTemporalBucket?.temporalBucket;

  const selectedItemName = activeTemporalBucket
    ? Lib.displayInfo(query, activeTemporalBucket).displayName
    : "";

  const selectedItemLabel = selectedItemName ? t`by ${selectedItemName}` : null;

  return (
    <PopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <TriggerButton onClick={onClick}>
          {selectedItemLabel}
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
              isSelected={item.temporalBucket === selectedItem}
              onSelect={() => onSelect(item.temporalBucket)}
            />
          ))}
        </SelectList>
      }
    />
  );
}

export default TemporalBucketPickerPopover;

import React, { useMemo } from "react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import * as Lib from "metabase-lib";
import {
  TriggerButton,
  TriggerIcon,
  SelectList,
  SelectListItem,
} from "./ColumnPrecisionPickerPopover.styled";

interface BinningStrategyPickerPopoverProps {
  selectedItem?: Lib.Bucket | null;
  query: Lib.Query;
  items: Lib.Bucket[];
  onSelect: (item: Lib.Bucket) => void;
}

type BinningStrategyListItem = Lib.BucketDisplayInfo & {
  binningStrategy: Lib.Bucket;
};

function BinningStrategyPickerPopover({
  selectedItem,
  query,
  items,
  onSelect,
}: BinningStrategyPickerPopoverProps) {
  const displayableItems: BinningStrategyListItem[] = useMemo(
    () =>
      items.map(binningStrategy => ({
        ...Lib.displayInfo(query, binningStrategy),
        binningStrategy,
      })),
    [query, items],
  );

  const defaultBinningStrategy = displayableItems.find(item => item.default);
  const activeBinningStrategy =
    selectedItem || defaultBinningStrategy?.binningStrategy;

  const selectedItemName = activeBinningStrategy
    ? Lib.displayInfo(query, activeBinningStrategy).displayName
    : null;

  return (
    <PopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <TriggerButton onClick={onClick}>
          {selectedItemName}
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
              isSelected={item.binningStrategy === selectedItem}
              onSelect={() => onSelect(item.binningStrategy)}
            />
          ))}
        </SelectList>
      }
    />
  );
}

export default BinningStrategyPickerPopover;

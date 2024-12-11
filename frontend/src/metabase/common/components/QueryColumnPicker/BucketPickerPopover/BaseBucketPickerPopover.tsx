import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import SelectList from "metabase/components/SelectList";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import type { ColorName } from "metabase/lib/colors/types";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  ChevronDown,
  MoreButton,
  SelectListItem,
  TriggerButton,
  TriggerIcon,
} from "./BaseBucketPickerPopover.styled";

export const INITIALLY_VISIBLE_ITEMS_COUNT = 7;

type NoBucket = null;

export type BucketListItem = {
  displayName: string;
  bucket: Lib.Bucket | NoBucket;
  default?: boolean;
  selected?: boolean;
};

export interface BaseBucketPickerPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  items: BucketListItem[];
  selectedBucket: Lib.Bucket | NoBucket;
  isEditing: boolean;
  triggerLabel?: string;
  hasArrowIcon?: boolean;
  hasChevronDown?: boolean;
  color?: ColorName;
  checkBucketIsSelected: (item: BucketListItem) => boolean;
  renderTriggerContent: (bucket?: Lib.BucketDisplayInfo) => ReactNode;
  onSelect: (column: Lib.Bucket | NoBucket) => void;
}

function _BaseBucketPickerPopover({
  query,
  stageIndex,
  items,
  selectedBucket,
  isEditing,
  triggerLabel,
  hasArrowIcon = true,
  color = "brand",
  checkBucketIsSelected,
  renderTriggerContent,
  onSelect,
  hasChevronDown,
}: BaseBucketPickerPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [isExpanded, setIsExpanded] = useState(
    isInitiallyExpanded(items, selectedBucket, checkBucketIsSelected),
  );

  const defaultBucket = useMemo(
    () => items.find(item => item.default)?.bucket,
    [items],
  );

  const handleExpand = useCallback((evt: React.MouseEvent) => {
    evt.stopPropagation();
    setIsExpanded(true);
  }, []);

  const handlePopoverClose = useCallback(() => {
    const nextState = isInitiallyExpanded(
      items,
      selectedBucket,
      checkBucketIsSelected,
    );
    setIsExpanded(nextState);
    setIsOpened(false);
  }, [items, selectedBucket, checkBucketIsSelected]);

  const triggerContentBucket = isEditing ? selectedBucket : defaultBucket;
  const triggerContentBucketDisplayInfo = triggerContentBucket
    ? Lib.displayInfo(query, stageIndex, triggerContentBucket)
    : undefined;

  const canExpand = items.length > INITIALLY_VISIBLE_ITEMS_COUNT;
  const hasMoreButton = canExpand && !isExpanded;
  const visibleItems = hasMoreButton
    ? items.slice(0, INITIALLY_VISIBLE_ITEMS_COUNT)
    : items;

  return (
    <Popover opened={isOpened} position="right" onClose={handlePopoverClose}>
      <Popover.Target>
        <TriggerButton
          className="base-bucket-picker-popover__trigger-button"
          aria-label={triggerLabel}
          data-testid="dimension-list-item-binning"
          onClick={event => {
            event.stopPropagation();
            setIsOpened(!isOpened);
          }}
          px="sm"
          miw="35%"
          maw="50%"
          py={0}
          variant="subtle"
          color="white"
          styles={{ label: { display: "flex", gap: "0.5rem" } }}
        >
          <Ellipsified>
            {renderTriggerContent(triggerContentBucketDisplayInfo)}
          </Ellipsified>
          {hasArrowIcon && !hasChevronDown && (
            <TriggerIcon name="chevronright" />
          )}
          {hasChevronDown && (
            <ChevronDown name="chevrondown" c="transparent !important" />
          )}
        </TriggerButton>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList p="sm" miw="10rem">
          {visibleItems.map(item => (
            <SelectListItem
              id={item.displayName}
              key={item.displayName}
              name={item.displayName}
              activeColor={color}
              isSelected={checkBucketIsSelected(item)}
              onSelect={(_id, event) => {
                event.stopPropagation();
                onSelect(item.bucket);
                handlePopoverClose();
              }}
            />
          ))}
          {hasMoreButton && (
            <MoreButton
              onClick={handleExpand}
              variant="subtle"
              color="brand"
              fullWidth
              px="md"
              py="sm"
              styles={{
                inner: { display: "flex", justifyContent: "flex-start" },
              }}
            >{t`More…`}</MoreButton>
          )}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}

function isInitiallyExpanded(
  items: BucketListItem[],
  selectedBucket: Lib.Bucket | NoBucket,
  checkBucketIsSelected: (item: BucketListItem) => boolean,
) {
  const canExpand = items.length > INITIALLY_VISIBLE_ITEMS_COUNT;
  if (!canExpand || !selectedBucket) {
    return false;
  }

  return (
    items.findIndex(item => checkBucketIsSelected(item)) >=
    INITIALLY_VISIBLE_ITEMS_COUNT
  );
}

export function getBucketListItem(
  query: Lib.Query,
  stageIndex: number,
  bucket: Lib.Bucket,
): BucketListItem {
  return {
    ...Lib.displayInfo(query, stageIndex, bucket),
    bucket,
  };
}

export const BaseBucketPickerPopover = Object.assign(_BaseBucketPickerPopover, {
  displayName: "BucketPickerPopover",
  TriggerButton,
});

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import SelectList from "metabase/components/SelectList";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import type { ColorName } from "metabase/lib/colors/types";
import * as Lib from "metabase-lib";
import {
  Content,
  MoreButton,
  TriggerButton,
  TriggerIcon,
  SelectListItem,
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
}: BaseBucketPickerPopoverProps) {
  const [isExpanded, setIsExpanded] = useState(
    isInitiallyExpanded(items, selectedBucket, checkBucketIsSelected),
  );

  const defaultBucket = useMemo(
    () => items.find(item => item.default)?.bucket,
    [items],
  );

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const handlePopoverClose = useCallback(() => {
    const nextState = isInitiallyExpanded(
      items,
      selectedBucket,
      checkBucketIsSelected,
    );
    setIsExpanded(nextState);
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
    <PopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <TriggerButton
          aria-label={triggerLabel}
          onClick={event => {
            event.stopPropagation();
            onClick();
          }}
          // Compat with E2E tests around MLv1-based components
          // Prefer using a11y role selectors
          data-testid="dimension-list-item-binning"
        >
          <Ellipsified>
            {renderTriggerContent(triggerContentBucketDisplayInfo)}
          </Ellipsified>
          {hasArrowIcon && <TriggerIcon name="chevronright" />}
        </TriggerButton>
      )}
      popoverContent={({ closePopover }) => (
        <Content>
          <SelectList>
            {visibleItems.map(item => (
              <SelectListItem
                id={item.displayName}
                key={item.displayName}
                name={item.displayName}
                activeColor={color}
                isSelected={checkBucketIsSelected(item)}
                onSelect={() => {
                  onSelect(item.bucket);
                  closePopover();
                }}
              />
            ))}
          </SelectList>
          {hasMoreButton && (
            <MoreButton onClick={handleExpand}>{t`More…`}</MoreButton>
          )}
        </Content>
      )}
      onClose={handlePopoverClose}
    />
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

  const isSelectedBucketAmongHiddenItems =
    items.findIndex(item => checkBucketIsSelected(item)) >=
    INITIALLY_VISIBLE_ITEMS_COUNT;

  return isSelectedBucketAmongHiddenItems;
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

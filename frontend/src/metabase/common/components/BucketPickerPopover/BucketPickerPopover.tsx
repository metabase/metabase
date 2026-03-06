import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { SelectList } from "metabase/common/components/SelectList";
import type { ColorName } from "metabase/lib/colors/types";
import { Button, Icon, Popover } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import S from "./BucketPickerPopover.module.css";

export type BucketPickerItem = {
  displayName: string;
  isDefault?: boolean;
  isSelected?: boolean;
};

export interface BucketPickerPopoverProps {
  triggerLabel: string;
  ariaLabel?: string;
  items: BucketPickerItem[];
  onSelect: (index: number) => void;
  initiallyVisibleItemsCount?: number;
  color?: ColorName;
  hasChevronDown?: boolean;
  className?: string;
  classNames?: { root?: string; chevronDown?: string };
}

export function BucketPickerPopover({
  triggerLabel,
  ariaLabel,
  items,
  onSelect,
  initiallyVisibleItemsCount,
  color: colorProp = "brand",
  hasChevronDown,
  className,
  classNames = {},
}: BucketPickerPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const canExpand =
    initiallyVisibleItemsCount != null &&
    items.length > initiallyVisibleItemsCount;

  const shouldBeExpanded = useMemo(
    () => shouldAutoExpand(items, canExpand, initiallyVisibleItemsCount),
    [items, canExpand, initiallyVisibleItemsCount],
  );

  const [isExpanded, setIsExpanded] = useState(shouldBeExpanded);

  const handleExpand = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsExpanded(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsExpanded(shouldBeExpanded);
    setIsOpened(false);
  }, [shouldBeExpanded]);

  const hasMoreButton = canExpand && !isExpanded;
  const visibleItems = hasMoreButton
    ? items.slice(0, initiallyVisibleItemsCount)
    : items;

  const activeColor = color(colorProp);

  return (
    <Popover
      opened={isOpened}
      position="right"
      onClose={handleClose}
      withinPortal={false}
      onChange={(opened) => !opened && handleClose()}
      floatingStrategy="fixed"
    >
      <Popover.Target>
        <Button
          className={cx(S.triggerButton, classNames.root, className)}
          data-bucket-trigger
          aria-label={ariaLabel ?? triggerLabel}
          data-testid="dimension-list-item-binning"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpened(!isOpened);
          }}
          px="sm"
          miw="35%"
          maw="50%"
          h="auto"
          py={0}
          variant="subtle"
          color="white"
          classNames={{ label: S.triggerButtonLabel }}
        >
          <Ellipsified>{triggerLabel}</Ellipsified>
          {!hasChevronDown && (
            <Icon name="chevronright" className={S.chevronIcon} />
          )}
          {hasChevronDown && (
            <Icon
              name="chevrondown"
              className={cx(S.chevronDown, classNames.chevronDown)}
            />
          )}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList
          p="sm"
          miw="10rem"
          style={
            {
              "--bucket-picker-active-color": activeColor,
            } as React.CSSProperties
          }
        >
          {visibleItems.map((item, index) => (
            <SelectList.Item
              className={S.selectListItem}
              id={item.displayName}
              key={item.displayName}
              name={item.displayName}
              isSelected={item.isSelected}
              onSelect={(_id, event) => {
                event.stopPropagation();
                onSelect(index);
                handleClose();
              }}
            />
          ))}
          {hasMoreButton && (
            <Button
              className={S.moreButton}
              onClick={handleExpand}
              variant="subtle"
              color="brand"
              fullWidth
              px="md"
              py="sm"
              styles={{
                inner: { display: "flex", justifyContent: "flex-start" },
              }}
            >{t`More…`}</Button>
          )}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}

function shouldAutoExpand(
  items: BucketPickerItem[],
  canExpand: boolean,
  initiallyVisibleItemsCount?: number,
): boolean {
  if (!canExpand || initiallyVisibleItemsCount == null) {
    return false;
  }

  // only expand when a selected item in the hidden range is a "real" option,
  // not the trailing unbucketed/"Don't bin" option (always last)
  const selectedIndex = items.findIndex((item) => item.isSelected);
  return (
    selectedIndex >= initiallyVisibleItemsCount &&
    selectedIndex < items.length - 1
  );
}

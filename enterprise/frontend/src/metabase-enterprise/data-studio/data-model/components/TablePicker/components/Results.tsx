import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Link } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import {
  type NumberFormatter,
  useNumberFormatter,
} from "metabase/common/hooks/use-number-formatter";
import * as Urls from "metabase/lib/urls";
import { Box, Checkbox, Flex, Icon, Skeleton, Stack, rem } from "metabase/ui";
import type { UserId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import { TYPE_ICONS } from "../constants";
import { type FlatItem, type TreePath, isTableNode } from "../types";
import { hasChildren } from "../utils";

import S from "./Results.module.css";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 40; // items can vary in size because of text wrapping
const INDENT_OFFSET = 18;

interface Props {
  items: FlatItem[];
  path: TreePath;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
  onItemToggle?: (item: FlatItem) => void;
  onRangeSelect?: (items: FlatItem[], targetItem: FlatItem) => void;
}

export function TablePickerResults({
  items,
  path,
  selectedIndex,
  toggle,
  onItemClick,
  onSelectedIndexChange,
  onItemToggle,
  onRangeSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { selectedItemsCount } = useSelection();
  const lastSelectedTableIndex = useRef<number | null>(null);

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: VIRTUAL_OVERSCAN,
    estimateSize: () => ITEM_MIN_HEIGHT,
    measureElement: (element) =>
      element?.getBoundingClientRect().height ?? ITEM_MIN_HEIGHT,
  });

  const latestItems = useLatest(items);
  const latestVirtual = useLatest(virtual);

  const virtualItems = virtual.getVirtualItems();

  const { data: usersData } = useListUsersQuery();
  const ownerNameById = useMemo(() => {
    const users = usersData?.data ?? [];
    return new Map<UserId, string>(
      users.map((user) => [user.id, user.common_name]),
    );
  }, [usersData]);

  useEffect(
    function scrollActiveTableIntoView() {
      if (path.tableId === undefined) {
        return;
      }
      const index = latestItems.current.findIndex(
        (item) => isTableNode(item) && item.value?.tableId === path.tableId,
      );
      if (index === -1) {
        return;
      }

      const visibleIndices = latestVirtual.current
        .getVirtualItems()
        .map((virtualItem) => virtualItem.index);
      if (visibleIndices.includes(index)) {
        return;
      }

      latestVirtual.current.scrollToIndex(index, {
        align: "start",
        behavior: "auto",
      });
    },
    [path.tableId, latestItems, latestVirtual],
  );

  useEffect(() => {
    // sync the selected index by focusing the corresponding item,
    // but only when the user is not currently typing in the search input
    if (document.activeElement?.tagName !== "INPUT") {
      document
        .querySelector<HTMLAnchorElement>(`[data-index='${selectedIndex}']`)
        ?.focus();
    }
  }, [selectedIndex]);

  // reset last selected table when there are no selected items
  useEffect(() => {
    if (selectedItemsCount === 0) {
      lastSelectedTableIndex.current = null;
    }
  }, [selectedItemsCount]);

  const handleCheckboxToggle = (
    item: FlatItem,
    itemIndex: number,
    options?: { isShiftPressed?: boolean },
  ) => {
    if (!onItemToggle) {
      return;
    }

    const isShiftPressed = Boolean(options?.isShiftPressed);
    const isTable = isTableNode(item);
    const hasRangeAnchor =
      lastSelectedTableIndex.current != null && onRangeSelect != null;
    const isRangeSelection = isShiftPressed && isTable && hasRangeAnchor;

    if (isRangeSelection) {
      if (!lastSelectedTableIndex.current) {
        return;
      }

      const start = Math.min(lastSelectedTableIndex.current, itemIndex);
      const end = Math.max(lastSelectedTableIndex.current, itemIndex);
      const rangeItems = items.slice(start, end + 1).filter((rangeItem) => {
        return !rangeItem.disabled && !rangeItem.isLoading;
      });

      if (rangeItems.length > 0) {
        onRangeSelect?.(rangeItems, item);
        lastSelectedTableIndex.current = itemIndex;
        return;
      }
    }

    onItemToggle(item);
    lastSelectedTableIndex.current = isTable ? itemIndex : null;
  };

  return (
    <Stack className={S.root} gap={0}>
      <Flex className={S.header} gap="sm" justify="flex-end">
        <Box className={cx(S.headerCell, S.ownerColumn)}>{t`Owner`}</Box>
        <Box className={cx(S.headerCell, S.rowsColumn)}>{t`Rows`}</Box>
        <Box
          className={cx(S.headerCell, S.publishedColumn)}
        >{t`Published`}</Box>
      </Flex>
      <Box ref={ref} className={S.results}>
        <Box style={{ height: virtual.getTotalSize() }}>
          {virtualItems.map(({ start, index }) => {
            const item = items[index];
            const parentIndex = items.findIndex(
              (item) => item.key === item.parent,
            );

            return (
              <ResultsItem
                key={item.key}
                item={item}
                parentIndex={parentIndex}
                path={path}
                start={start}
                index={index}
                selectedIndex={selectedIndex}
                toggle={toggle}
                onItemClick={onItemClick}
                onSelectedIndexChange={onSelectedIndexChange}
                onCheckboxToggle={handleCheckboxToggle}
                rootRef={ref}
                ownerNameById={ownerNameById}
              />
            );
          })}
        </Box>
      </Box>
    </Stack>
  );
}

function ElementCheckbox({
  item,
  index,
  disabled = false,
  onCheckboxToggle,
}: {
  item: FlatItem;
  index: number;
  onCheckboxToggle?: (
    item: FlatItem,
    index: number,
    options?: { isShiftPressed?: boolean },
  ) => void;
  disabled?: boolean;
}) {
  if (item.isLoading) {
    return null;
  }

  const indeterminate = item.isSelected === "some";

  const { isSelected } = item;

  return (
    <Checkbox
      size="sm"
      checked={isSelected !== "no"}
      className={S.checkbox}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onCheckboxToggle?.(item, index, {
          isShiftPressed: Boolean(
            (event.nativeEvent as { shiftKey?: boolean }).shiftKey,
          ),
        });
      }}
      wrapperProps={{
        onClick(event) {
          event.preventDefault();
          event.stopPropagation();

          if ((event.target as HTMLElement).tagName.toLowerCase() === "input") {
            // it's already handled in onClick
            return;
          }

          if (disabled) {
            return;
          }

          onCheckboxToggle?.(item, index, {
            isShiftPressed: event.shiftKey,
          });
        },
      }}
      onChange={() => {}}
      indeterminate={indeterminate}
    />
  );
}

function Loading() {
  const width = useMemo(() => 100 + Math.random() * 100, []);

  return (
    <Skeleton
      data-testid="loading-placeholder"
      height={rem(16)}
      width={width}
      radius="sm"
    />
  );
}

interface ResultsItemProps {
  item: FlatItem;
  path: TreePath;
  parentIndex: number;
  start: number;
  index: number;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
  onCheckboxToggle?: (
    item: FlatItem,
    index: number,
    options?: { isShiftPressed?: boolean },
  ) => void;
  rootRef: React.RefObject<HTMLDivElement>;
  ownerNameById: Map<UserId, string>;
}

function isDatabaseActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    selectedItemsCount === 0 &&
    item.type === "database" &&
    item.value?.databaseId === path.databaseId &&
    path.tableId == null &&
    (path.schemaName == null || item.children.length === 1)
  );
}

function isSchemaActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    selectedItemsCount === 0 &&
    item.type === "schema" &&
    item.value?.databaseId === path.databaseId &&
    item.value?.schemaName === path.schemaName &&
    path.tableId == null
  );
}

function isTableActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    selectedItemsCount === 0 &&
    isTableNode(item) &&
    item.value?.tableId === path.tableId
  );
}

function isItemActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    isDatabaseActive(item, path, selectedItemsCount) ||
    isSchemaActive(item, path, selectedItemsCount) ||
    isTableActive(item, path, selectedItemsCount)
  );
}

const ResultsItem = ({
  item,
  path,
  start,
  index,
  selectedIndex,
  parentIndex,
  toggle,
  onItemClick,
  onSelectedIndexChange,
  onCheckboxToggle,
  rootRef,
  ownerNameById,
}: ResultsItemProps) => {
  const { selectedItemsCount } = useSelection();
  const { value, label, type, isExpanded, isLoading, key, level, disabled } =
    item;
  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const ownerDisplay = getOwnerDisplay(item, ownerNameById);
  const expectedRowsDisplay = getExpectedRowsDisplay(item, formatNumber);
  const publishedDisplay = getPublishedDisplay(item);

  const isActive = isItemActive(item, path, selectedItemsCount);
  const indent = level * INDENT_OFFSET;
  const itemHasChildren = hasChildren(type);

  const handleItemSelect = (open?: boolean, event?: React.MouseEvent) => {
    if (disabled) {
      return;
    }

    // In multi-select mode, prevent navigation and allow toggling for items with children
    if (selectedItemsCount > 0) {
      if (itemHasChildren) {
        // Toggle expansion for items with children
        if (open !== undefined) {
          toggle?.(key, open);
        } else {
          toggle?.(key);
        }
      }
      // Prevent Link navigation in multi-select mode
      if (event) {
        event.preventDefault();
      }
      return;
    }

    // In single-select mode:
    // If the item is already active, toggle its expansion state
    // Otherwise, navigate to make it active
    if (isActive && itemHasChildren) {
      // Second click on active item: toggle expansion
      if (open !== undefined) {
        toggle?.(key, open);
      } else {
        toggle?.(key);
      }

      // Prevent Link navigation when toggling
      if (event) {
        event.preventDefault();
      }
    } else {
      // First click or clicking on a field: navigate
      if (open !== undefined) {
        toggle?.(key, open);
      }

      if (value) {
        // Expand collapsed items when navigating to them
        if (!isExpanded && itemHasChildren) {
          toggle?.(key, true);
        }

        onItemClick?.(value);
      }
    }
  };

  function itemByIndex(index: number) {
    return rootRef.current?.querySelector<HTMLAnchorElement>(
      `[data-index='${index}']`,
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (typeof selectedIndex === "number") {
      // If there is a selected index externally
      // don't handle the key events
      return;
    }
    if (event.code === "ArrowDown") {
      // focus the next item in the list
      // does not wrap at around
      itemByIndex(index + 1)?.focus();
      event.preventDefault();
    }
    if (event.code === "ArrowUp") {
      // focus the previous item in the list
      // does not wrap at around
      itemByIndex(index - 1)?.focus();
      event.preventDefault();
    }
    if (event.code === "ArrowLeft") {
      if (isExpanded) {
        // when expanded, close the item
        toggle?.(key, false);
      } else {
        // when already closed, go to parent node
        itemByIndex(parentIndex)?.focus();
      }
      event.preventDefault();
    }
    if (event.code === "ArrowRight") {
      if (!isExpanded) {
        // expand the item
        handleItemSelect(true);
      } else {
        // go to first child
        itemByIndex(index + 1)?.focus();
      }
      event.preventDefault();
    }

    if (!disabled && (event.code === "Space" || event.code === "Enter")) {
      // toggle the current item
      handleItemSelect();
      event.preventDefault();
    }
  };

  // Dedicated toggle target: always toggles expansion without navigating
  // regardless of whether the item is currently active.
  const handleChevronClick = (e: MouseEvent<HTMLDivElement>) => {
    if (disabled || !itemHasChildren) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    toggle?.(key);
  };

  return (
    <Flex
      component={Link}
      key={key}
      aria-selected={isActive}
      align="center"
      justify="flex-start"
      gap={0}
      w="100%"
      mih={ITEM_MIN_HEIGHT}
      className={cx(S.item, S[type], {
        [S.active]: isActive,
        [S.selected]: selectedIndex === index,
      })}
      data-index={index}
      data-open={isExpanded}
      tabIndex={disabled ? -1 : 0}
      style={{
        transform: `translateY(${start}px)`,
        pointerEvents: disabled ? "none" : undefined,
      }}
      to={Urls.dataStudioData({
        databaseId: value?.databaseId,
        schemaName:
          type === "schema" || isTableNode(item)
            ? item.value?.schemaName
            : undefined,
        tableId: isTableNode(item) ? item.value?.tableId : undefined,
      })}
      data-testid="tree-item"
      data-type={type}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        handleItemSelect(undefined, e);
      }}
      onFocus={() => onSelectedIndexChange?.(index)}
    >
      <Box className={S.checkboxColumn}>
        <ElementCheckbox
          item={item}
          index={index}
          disabled={disabled}
          onCheckboxToggle={onCheckboxToggle}
        />
      </Box>

      <Flex align="center" py="xs" w="100%" pl={indent} gap="sm">
        <Flex align="flex-start" gap="xs" className={S.content}>
          <Flex align="center" gap="xs">
            <Box
              className={cx(S.chevronSlot, {
                [S.hasChildren]: itemHasChildren,
              })}
              w={INDENT_OFFSET}
              aria-expanded={Boolean(isExpanded)}
              onClick={handleChevronClick}
            >
              {itemHasChildren && (
                <Icon
                  name="chevronright"
                  size={16}
                  color="text-tertiary"
                  className={cx(S.chevron, {
                    [S.expanded]: isExpanded,
                  })}
                />
              )}
            </Box>

            <Icon name={TYPE_ICONS[type]} className={S.icon} />
          </Flex>

          {isLoading ? (
            <Loading />
          ) : (
            <Box
              className={S.label}
              c={
                isTableNode(item) &&
                item.table &&
                item.table.visibility_type != null &&
                !isActive
                  ? "text-secondary"
                  : undefined
              }
              data-testid="tree-item-label"
              pl="sm"
            >
              {label}
            </Box>
          )}
        </Flex>

        {isTableNode(item) && (
          <>
            <Box
              className={cx(S.column, S.ownerColumn)}
              data-testid="table-owner"
            >
              {ownerDisplay}
            </Box>

            <Box
              className={cx(S.column, S.rowsColumn)}
              data-testid="table-expected-rows"
            >
              {expectedRowsDisplay}
            </Box>

            <Box
              className={cx(S.column, S.publishedColumn)}
              pl="md"
              data-testid="table-published"
            >
              {publishedDisplay}
            </Box>
          </>
        )}
      </Flex>
    </Flex>
  );
};

function getOwnerDisplay(
  item: FlatItem,
  ownerNameById: Map<UserId, string>,
): string {
  if (!isTableNode(item) || item.isLoading || !item.table) {
    return "";
  }

  const ownerId = item.table.owner_user_id;
  if (ownerId != null && ownerNameById.has(ownerId)) {
    return ownerNameById.get(ownerId) ?? "";
  }

  if (item.table.owner_email) {
    return item.table.owner_email;
  }

  return "";
}

function getExpectedRowsDisplay(
  item: FlatItem,
  formatNumber: NumberFormatter,
): string | null {
  if (!isTableNode(item) || item.isLoading || !item.table) {
    return null;
  }

  const expectedRows = item.table.estimated_row_count;

  if (!expectedRows) {
    return null;
  }

  const formatted = formatNumber(expectedRows);
  return formatted;
}

function getPublishedDisplay(item: FlatItem): React.ReactNode {
  if (!isTableNode(item) || item.isLoading || !item.table) {
    return null;
  }

  return item.table.is_published ? (
    <Icon name="verified_round" aria-label={t`Published`} />
  ) : null;
}

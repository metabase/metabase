import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type KeyboardEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import {
  type NumberFormatter,
  useNumberFormatter,
} from "metabase/common/hooks/use-number-formatter";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Checkbox, Flex, Icon, Skeleton, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field, UserId } from "metabase-types/api";

import { DataModelContext } from "../../../DataModelContext";
import { useSelection } from "../../../contexts/SelectionContext";
import { getUrl } from "../../../utils";
import { TYPE_ICONS } from "../constants";
import type { FlatItem, TreePath } from "../types";
import { hasChildren } from "../utils";

import S from "./Results.module.css";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 39; // items can vary in size because of text wrapping
const INDENT_OFFSET = 18;

interface Props {
  items: FlatItem[];
  path: TreePath;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
  onItemToggle?: (item: FlatItem) => void;
}

export function TablePickerResults({
  items,
  path,
  selectedIndex,
  toggle,
  onItemClick,
  onSelectedIndexChange,
  onItemToggle,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: VIRTUAL_OVERSCAN,
    estimateSize: () => ITEM_MIN_HEIGHT,
    measureElement: (element) =>
      element?.getBoundingClientRect().height ?? ITEM_MIN_HEIGHT,
  });

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
      const index = items.findIndex(
        (item) => item.type === "table" && item.value?.tableId === path.tableId,
      );
      if (index === -1) {
        return;
      }

      const visibleIndices = virtual
        .getVirtualItems()
        .map((virtualItem) => virtualItem.index);
      if (visibleIndices.includes(index)) {
        return;
      }

      virtual.scrollToIndex(index, { align: "start", behavior: "auto" });
    },
    // TODO: fix it, avoids unnecessary jumps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path.tableId],
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

  return (
    <>
      <Flex className={S.header} gap="sm">
        <Box className={S.headerSpacer} />
        <Box className={cx(S.headerCell, S.ownerColumn)}>{t`Owner`}</Box>
        <Box className={cx(S.headerCell, S.rowsColumn)}>{t`Rows`}</Box>
        <Box
          className={cx(S.headerCell, S.publishedColumn)}
        >{t`Published`}</Box>
      </Flex>
      <Box ref={ref} pb="lg" className={S.results}>
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
                onItemToggle={onItemToggle}
                rootRef={ref}
                ownerNameById={ownerNameById}
              />
            );
          })}
        </Box>
      </Box>
    </>
  );
}

function ElementCheckbox({
  item,
  onItemToggle,
  disabled = false,
}: {
  item: FlatItem;
  onItemToggle: ((item: FlatItem) => void) | undefined;
  disabled?: boolean;
}) {
  if (item.isLoading) {
    return null;
  }

  // fields don't have checkboxes, only active state
  if (item.type === "field") {
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
      }}
      onChange={(event) => {
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onItemToggle?.(item);
      }}
      indeterminate={indeterminate}
    />
  );
}

function Loading() {
  const w = 20 + Math.random() * 80;

  return (
    <Skeleton
      data-testid="loading-placeholder"
      height={rem(12)}
      width={`${w}%`}
      radius="sm"
    />
  );
}

function getIconForField(field: Field) {
  const typeInfo = Lib.legacyColumnTypeInfo(field);
  return getColumnIcon(typeInfo);
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
  onItemToggle?: (item: FlatItem) => void;
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
    path.fieldId == null &&
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
    path.tableId == null &&
    path.fieldId == null
  );
}

function isTableActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    selectedItemsCount === 0 &&
    item.type === "table" &&
    item.value?.tableId === path.tableId &&
    path.fieldId == null
  );
}

function isFieldActive(
  item: FlatItem,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  return (
    selectedItemsCount === 0 &&
    item.type === "field" &&
    item.value?.tableId === path.tableId &&
    item.value?.fieldId === path.fieldId
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
    isTableActive(item, path, selectedItemsCount) ||
    isFieldActive(item, path, selectedItemsCount)
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
  onItemToggle,
  rootRef,
  ownerNameById,
}: ResultsItemProps) => {
  const { selectedItemsCount } = useSelection();
  const { baseUrl } = useContext(DataModelContext);
  const { value, label, type, isExpanded, isLoading, key, level, disabled } =
    item;
  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const ownerDisplay = getOwnerDisplay(item, ownerNameById);
  const expectedRowsDisplay = getExpectedRowsDisplay(item, formatNumber);

  const isActive = isItemActive(item, path, selectedItemsCount);
  const indent = level * INDENT_OFFSET;
  const hasToggle = hasChildren(type);

  const handleItemSelect = (open?: boolean, event?: React.MouseEvent) => {
    if (disabled) {
      return;
    }

    // In multi-select mode, prevent navigation and allow toggling for items with children
    if (selectedItemsCount > 0) {
      if (hasChildren(type)) {
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
    if (isActive && hasChildren(type)) {
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

      // Only navigate in single-select mode
      if (selectedItemsCount === 0 && value) {
        // Expand collapsed items when navigating to them
        if (!isExpanded && hasChildren(type)) {
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
      if (isExpanded && type !== "field") {
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
        if (type !== "field") {
          handleItemSelect(true);
        }
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

  return (
    <Flex
      component={Link}
      key={key}
      aria-selected={isActive}
      align="center"
      justify="flex-start"
      gap={0}
      w="100%"
      pl="md"
      className={cx(S.item, S[type], {
        [S.active]: isActive,
        [S.selected]: selectedIndex === index,
      })}
      data-index={index}
      data-open={isExpanded}
      tabIndex={disabled ? -1 : 0}
      style={{
        top: start,
        pointerEvents: disabled ? "none" : undefined,
      }}
      to={getUrl(baseUrl, {
        databaseId: value?.databaseId,
        schemaName:
          type === "schema" || type === "table" || type === "field"
            ? value?.schemaName
            : undefined,
        tableId:
          type === "table" || type === "field" ? value?.tableId : undefined,
        fieldId: type === "field" ? value?.fieldId : undefined,
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
          onItemToggle={onItemToggle}
          disabled={disabled}
        />
      </Box>

      <Flex
        align="center"
        mih={ITEM_MIN_HEIGHT}
        py="xs"
        w="100%"
        pl={indent}
        gap="sm"
      >
        <Flex align="flex-start" gap="xs" className={S.content}>
          <Flex align="center" gap="xs">
            <Box className={S.chevronSlot} w={INDENT_OFFSET}>
              {hasToggle && (
                <Icon
                  name="chevronright"
                  size={16}
                  color="var(--mb-color-text-light)"
                  className={cx(S.chevron, {
                    [S.expanded]: isExpanded,
                  })}
                />
              )}
            </Box>

            <Icon
              name={
                type === "field" && item.field
                  ? getIconForField(item.field)
                  : TYPE_ICONS[type]
              }
              className={S.icon}
            />
          </Flex>

          {isLoading ? (
            <Loading />
          ) : (
            <Box
              className={S.label}
              c={
                type === "table" &&
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

        {type === "table" && (
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

            <Box className={cx(S.column, S.publishedColumn)}></Box>
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
  if (item.type !== "table" || item.isLoading || !item.table) {
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
  if (item.type !== "table" || item.isLoading || !item.table) {
    return null;
  }

  const expectedRows = item.table.estimated_row_count;

  if (!expectedRows) {
    return null;
  }

  const formatted = formatNumber(expectedRows);
  return formatted;
}

import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { Link } from "react-router";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Checkbox, Flex, Icon, Skeleton, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import { useSelection } from "../../../contexts/SelectionContext";
import { getUrl } from "../../../utils";
import { TYPE_ICONS } from "../constants";
import type { FlatItem, TreePath } from "../types";
import { hasChildren } from "../utils";

import S from "./Results.module.css";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32; // items can vary in size because of text wrapping
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
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, index }) => {
          const item = items[index];
          return (
            <ResultsItem
              key={item.key}
              item={item}
              items={items}
              path={path}
              start={start}
              index={index}
              selectedIndex={selectedIndex}
              toggle={toggle}
              onItemClick={onItemClick}
              onSelectedIndexChange={onSelectedIndexChange}
              onItemToggle={onItemToggle}
              ref={ref}
            />
          );
        })}
      </Box>
    </Box>
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
  items: FlatItem[];
  path: TreePath;
  start: number;
  index: number;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
  onItemToggle?: (item: FlatItem) => void;
  ref: React.RefObject<HTMLDivElement>;
}

const ResultsItem = ({
  item,
  items,
  path,
  start,
  index,
  selectedIndex,
  toggle,
  onItemClick,
  onSelectedIndexChange,
  onItemToggle,
  ref,
}: ResultsItemProps) => {
  const { selectedItemsCount } = useSelection();

  const {
    value,
    label,
    type,
    isExpanded,
    isLoading,
    key,
    level,
    parent,
    disabled,
    children,
  } = item;

  // Database is active when:
  // 1. We're at /database/X (no schema in URL), OR
  // 2. We're at /database/X/schema/Y AND the database has only one schema (auto-selected)
  const isDatabaseActive =
    selectedItemsCount === 0 &&
    type === "database" &&
    value?.databaseId === path.databaseId &&
    path.tableId == null &&
    path.fieldId == null &&
    (path.schemaName == null || children.length === 1);
  const isSchemaActive =
    selectedItemsCount === 0 &&
    type === "schema" &&
    value?.databaseId === path.databaseId &&
    value?.schemaName === path.schemaName &&
    path.tableId == null &&
    path.fieldId == null;
  const isTableActive =
    selectedItemsCount === 0 &&
    type === "table" &&
    value?.tableId === path.tableId &&
    path.fieldId == null;
  const isFieldActive =
    selectedItemsCount === 0 &&
    type === "field" &&
    value?.tableId === path.tableId &&
    value?.fieldId === path.fieldId;
  const isActive =
    isDatabaseActive || isSchemaActive || isTableActive || isFieldActive;

  const parentIndex = items.findIndex((item) => item.key === parent);
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
    return ref.current?.querySelector<HTMLAnchorElement>(
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
      to={getUrl({
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
        style={{ paddingLeft: indent }}
      >
        <Flex align="flex-start" gap="xs" w="100%">
          <Flex align="center" gap="xs">
            <Box
              className={S.chevronSlot}
              style={{ width: `${INDENT_OFFSET}px` }}
            >
              {hasToggle && (
                <Icon
                  name="chevronright"
                  size={10}
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
      </Flex>
    </Flex>
  );
};

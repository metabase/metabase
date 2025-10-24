import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Flex, Icon, Skeleton, rem } from "metabase/ui";
import type { SchemaName, TableId } from "metabase-types/api";

import { getUrl } from "../../../utils";
import { TYPE_ICONS } from "../constants";
import type {
  CollectionItem,
  FlatItem,
  ItemType,
  ModelItem,
  TableItem,
  TreePath,
} from "../types";
import {
  getSchemaId,
  isItemWithHiddenExpandIcon,
  noManuallySelectedTables,
  getParentSchema,
  areTablesSelected,
} from "../utils";

import { BulkTableVisibilityToggle } from "./BulkTableVisibilityToggle";
import S from "./Results.module.css";
import { TableVisibilityToggle } from "./TableVisibilityToggle";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32; // items can vary in size because of text wrapping
const INDENT_OFFSET = 18;

interface Props {
  items: FlatItem[];
  path: TreePath;
  reload?: (path: TreePath) => void;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  withMassToggle?: boolean;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
  onItemToggle?: (item: FlatItem) => void;
  selectedItems?: Set<TableId>;
  selectedSchemas?: Set<SchemaName>;
}

export function Results({
  items,
  path,
  reload,
  selectedIndex,
  toggle,
  withMassToggle,
  onItemClick,
  onSelectedIndexChange,
  onItemToggle,
  selectedItems,
  selectedSchemas,
}: Props) {
  const [activeItem, setActiveItem] = useState<
    { type: ItemType; id: number | string } | undefined
  >(() => {
    if (path.tableId != null) {
      return { type: "table", id: path.tableId };
    }
    if (path.modelId != null) {
      return { type: "model", id: path.modelId };
    }
  });
  const ref = useRef<HTMLDivElement | null>(null);

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: VIRTUAL_OVERSCAN,
    estimateSize: () => ITEM_MIN_HEIGHT,
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

      virtual.scrollToIndex(index);
    },
    [path.tableId, items, virtual],
  );

  useEffect(
    function measureItemsWhenTheyChange() {
      const { startIndex = 0, endIndex = 0 } = virtual.range ?? {};
      for (let idx = startIndex; idx <= endIndex; idx++) {
        virtual.measureElement(
          ref.current?.querySelector(`[data-index='${idx}']`),
        );
      }
    },
    [items, virtual],
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

  useEffect(
    function cleanSelectionOnPathChange() {
      if (
        !path.databaseId &&
        !path.schemaName &&
        !path.tableId &&
        !path.collectionId &&
        !path.modelId
      ) {
        setActiveItem(undefined);
      }
    },
    [
      path.collectionId,
      path.databaseId,
      path.modelId,
      path.schemaName,
      path.tableId,
    ],
  );

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, index }) => {
          const item = items[index] as FlatItem;
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
          } = item;
          const isActive =
            (item.type === "table" &&
              activeItem?.type === "table" &&
              item.value?.tableId === activeItem.id) ||
            (item.type === "model" &&
              activeItem?.type === "model" &&
              item.value?.modelId === activeItem.id);
          const parentIndex = items.findIndex((item) => item.key === parent);
          const children = items.filter((item) => item.parent === key);
          const hasTableChildren = children.some(
            (child) => child.type === "table",
          );
          const typedValue = value as TreePath | undefined;

          const handleItemSelect = (open?: boolean) => {
            if (disabled) {
              return;
            }

            toggle?.(key, open);

            if (
              value &&
              (!isExpanded || type === "table" || type === "model")
            ) {
              onItemClick?.(value);
            }

            if (type === "table" && (value as TableItem["value"])?.tableId) {
              setActiveItem({
                type: "table",
                id: (value as TableItem["value"]).tableId,
              });
            }

            if (type === "model" && (value as ModelItem["value"])?.modelId) {
              setActiveItem({
                type: "model",
                id: (value as ModelItem["value"]).modelId,
              });
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
              if (isExpanded && type !== "table") {
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
                if (type !== "table") {
                  handleItemSelect(true);
                }
              } else {
                // go to first child
                itemByIndex(index + 1)?.focus();
              }
              event.preventDefault();
            }

            if (
              !disabled &&
              (event.code === "Space" || event.code === "Enter")
            ) {
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
              justify="space-between"
              gap="sm"
              className={cx(S.item, {
                [S.active]: isActive,
                [S.selected]: selectedIndex === index,
              })}
              data-index={index}
              data-open={isExpanded}
              tabIndex={disabled ? -1 : 0}
              style={{
                top: start,
                marginLeft: level * INDENT_OFFSET,
                pointerEvents: disabled ? "none" : undefined,
              }}
              to={getUrl({
                databaseId: typedValue?.databaseId,
                schemaName:
                  type === "schema" || type === "table"
                    ? typedValue?.schemaName
                    : undefined,
                tableId: type === "table" ? typedValue?.tableId : undefined,
                fieldId: undefined,
                collectionId: typedValue?.collectionId,
                modelId: typedValue?.modelId,
                fieldName: undefined,
              })}
              data-testid="tree-item"
              data-type={type}
              onKeyDown={handleKeyDown}
              onClick={(event) => {
                event.preventDefault();
                handleItemSelect();
              }}
              onFocus={() => onSelectedIndexChange?.(index)}
            >
              <Flex align="center" mih={ITEM_MIN_HEIGHT} py="xs" w="100%">
                <Flex align="flex-start" gap="xs" w="100%">
                  <Flex align="center" gap="xs">
                    <Icon
                      name="chevronright"
                      size={10}
                      color="var(--mb-color-text-light)"
                      className={cx(S.chevron, {
                        [S.expanded]: isExpanded,
                        [CS.hidden]: isItemWithHiddenExpandIcon(item),
                      })}
                    />

                    <Icon
                      {...((item as CollectionItem).icon || {
                        name: TYPE_ICONS[type],
                      })}
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

              <ElementCheckbox
                item={item}
                selectedItems={selectedItems}
                selectedSchemas={selectedSchemas}
                onItemToggle={onItemToggle}
                allItems={items}
              />
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}

function ElementCheckbox({
  item,
  selectedItems,
  selectedSchemas,
  onItemToggle,
  allItems,
}: {
  item: FlatItem;
  allItems: FlatItem[];
  selectedItems: Set<TableId> | undefined;
  selectedSchemas: Set<SchemaName> | undefined;
  onItemToggle: ((item: FlatItem) => void) | undefined;
}) {
  const isItemSelected =
    item.type === "table" && selectedItems?.has(item.value?.tableId ?? "");

  const isSchemaItemSelected =
    item.type === "schema" && selectedSchemas?.has(getSchemaId(item) ?? "");
  const schemaTablesSelected =
    item.type === "schema" && areTablesSelected(item, allItems, selectedItems);
  const isIndeterminate = schemaTablesSelected === "some" ? true : undefined;

  const isChecked =
    isItemSelected ||
    isSchemaItemSelected ||
    schemaTablesSelected === "all" ||
    isIndeterminate;

  if (item.type === "database") {
    return null;
  }

  return (
    <Checkbox
      size="sm"
      checked={isChecked}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onChange={() => {
        onItemToggle?.(item);
      }}
      {...(isIndeterminate ? { indeterminate: true } : {})}
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

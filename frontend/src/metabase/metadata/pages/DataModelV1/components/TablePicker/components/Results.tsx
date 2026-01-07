import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { Box, Flex, Icon, Skeleton, rem } from "metabase/ui";

import { TYPE_ICONS } from "../constants";
import type { FlatItem, TreePath } from "../types";
import { hasChildren } from "../utils";

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
}: Props) {
  const [activeTableId, setActiveTableId] = useState(path.tableId);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, index }) => {
          const item = items[index];
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
          const isActive = type === "table" && value?.tableId === activeTableId;
          const parentIndex = items.findIndex((item) => item.key === parent);
          const children = items.filter((item) => item.parent === key);
          const hasTableChildren = children.some(
            (child) => child.type === "table",
          );

          const handleItemSelect = (open?: boolean) => {
            if (disabled) {
              return;
            }

            toggle?.(key, open);

            if (value && (!isExpanded || type === "table")) {
              onItemClick?.(value);
            }

            if (type === "table") {
              setActiveTableId(value?.tableId);
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
              className={cx(S.item, S[type], {
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
              to={Urls.dataModel({
                databaseId: value?.databaseId,
                schemaName:
                  type === "schema" || type === "table"
                    ? value?.schemaName
                    : undefined,
                tableId: type === "table" ? value?.tableId : undefined,
                fieldId: undefined,
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
                    {hasChildren(type) && (
                      <Icon
                        name="chevronright"
                        size={10}
                        c="text-tertiary"
                        className={cx(S.chevron, {
                          [S.expanded]: isExpanded,
                        })}
                      />
                    )}

                    <Icon name={TYPE_ICONS[type]} className={S.icon} />
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

              {withMassToggle &&
                type === "database" &&
                value?.databaseId !== undefined &&
                hasTableChildren &&
                !disabled && (
                  <BulkTableVisibilityToggle
                    className={S.massVisibilityToggle}
                    tables={children.flatMap((child) =>
                      child.type === "table" && child.table != null
                        ? [child.table]
                        : [],
                    )}
                    onUpdate={() => reload?.(value)}
                  />
                )}

              {withMassToggle &&
                type === "schema" &&
                value?.schemaName !== undefined &&
                hasTableChildren &&
                !disabled && (
                  <BulkTableVisibilityToggle
                    className={S.massVisibilityToggle}
                    tables={children.flatMap((child) =>
                      child.type === "table" && child.table != null
                        ? [child.table]
                        : [],
                    )}
                    onUpdate={() => reload?.(value)}
                  />
                )}

              {type === "table" &&
                value?.tableId !== undefined &&
                item.table &&
                !disabled && (
                  <TableVisibilityToggle
                    className={cx(S.visibilityToggle, {
                      [S.hidden]: item.table.visibility_type == null,
                    })}
                    table={item.table}
                    onUpdate={() => reload?.(value)}
                  />
                )}
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}

function Loading() {
  const width = useMemo(() => 20 + Math.random() * 80, []);

  return (
    <Skeleton
      data-testid="loading-placeholder"
      height={rem(16)}
      width={`${width}%`}
      radius="sm"
    />
  );
}

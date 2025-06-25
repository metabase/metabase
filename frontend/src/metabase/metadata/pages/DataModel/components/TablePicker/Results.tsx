import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { Fragment, type KeyboardEvent, useEffect, useRef } from "react";
import _ from "underscore";

import { isSyncCompleted } from "metabase/lib/syncing";
import { Box, Flex, Icon, Skeleton, rem } from "metabase/ui";

import S from "./Results.module.css";
import { TableVisibilityToggle } from "./TableVisibilityToggle";
import type { FlatItem, TreePath } from "./types";
import { TYPE_ICONS, hasChildren } from "./utils";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32;
const INDENT_OFFSET = 18;

export function Results({
  items,
  toggle,
  path,
  onItemClick,
  selectedIndex,
  onSelectedIndexChange,
}: {
  items: FlatItem[];
  toggle?: (key: string, value?: boolean) => void;
  path: TreePath;
  onItemClick?: (path: TreePath) => void;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
}) {
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
        .querySelector<HTMLDivElement>(`[data-index='${selectedIndex}']`)
        ?.focus();
    }
  }, [selectedIndex]);

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, size, index }) => {
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
          } = item;
          const isActive = type === "table" && _.isEqual(path, value);
          const isDisabled =
            type === "table" && (!item.table || !isSyncCompleted(item.table));

          const parentIndex = items.findIndex((item) => item.key === parent);
          const parentItem = virtualItems.find(
            (item) => item.index === parentIndex,
          );

          const handleItemSelect = (open?: boolean) => {
            if (isDisabled) {
              return;
            }

            toggle?.(key, open);
            if (value && (!isExpanded || type === "table")) {
              onItemClick?.(value);
            }
          };

          function itemByIndex(index: number) {
            return ref.current?.querySelector<HTMLDivElement>(
              `[data-index='${index}']`,
            );
          }

          const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
              !isDisabled &&
              (event.code === "Space" || event.code === "Enter")
            ) {
              // toggle the current item
              handleItemSelect();
              event.preventDefault();
            }
          };

          return (
            <Fragment key={key}>
              {type !== "database" && (
                <Track
                  start={
                    parentItem ? parentItem.start + 0.5 * parentItem.size : 0
                  }
                  end={start + 0.5 * size}
                  level={level}
                />
              )}
              <Flex
                key={key}
                align="center"
                justify="space-between"
                gap="sm"
                ref={virtual.measureElement}
                className={cx(S.item, S[type], {
                  [S.active]: isActive,
                  [S.selected]: selectedIndex === index,
                })}
                data-index={index}
                data-open={isExpanded}
                tabIndex={
                  isDisabled
                    ? -1
                    : selectedIndex === undefined || type === "table"
                      ? 0
                      : undefined
                }
                style={{
                  top: start,
                  marginLeft: level * INDENT_OFFSET,
                  pointerEvents: isDisabled ? "none" : undefined,
                }}
                data-testid="tree-item"
                data-type={type}
                onKeyDown={handleKeyDown}
                onClick={() => handleItemSelect()}
                onFocus={() => onSelectedIndexChange?.(index)}
              >
                <Flex align="center" gap="xs" py="xs" mih={ITEM_MIN_HEIGHT}>
                  {hasChildren(type) && (
                    <Icon
                      name="chevronright"
                      size={10}
                      color="var(--mb-color-text-light)"
                      className={cx(S.chevron, {
                        [S.expanded]: isExpanded,
                      })}
                    />
                  )}
                  <Icon name={TYPE_ICONS[type]} className={S.icon} />
                  {isLoading ? (
                    <Loading />
                  ) : (
                    <Box
                      pl="sm"
                      className={S.label}
                      data-testid="tree-item-label"
                    >
                      {label}
                    </Box>
                  )}
                </Flex>
                {type === "table" &&
                  value?.tableId !== undefined &&
                  item.table &&
                  !isDisabled && (
                    <TableVisibilityToggle
                      className={S.visibilityToggle}
                      table={item.table}
                    />
                  )}
              </Flex>
            </Fragment>
          );
        })}
      </Box>
    </Box>
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

function Track({
  start,
  end,
  level,
}: {
  start: number;
  end: number;
  level: number;
}) {
  const LEFT = 18;
  const TOP = 20;

  const top = start + TOP;

  return (
    <div
      className={S.track}
      style={{
        top,
        height: end - top,
        left: LEFT + level * INDENT_OFFSET,
      }}
    />
  );
}

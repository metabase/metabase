import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { Fragment, useEffect, useRef } from "react";
import _ from "underscore";

import { Box, Flex, Icon, Skeleton } from "metabase/ui";

import S from "./Results.module.css";
import type { FlatItem, TreePath } from "./types";
import { getIconForType, hasChildren } from "./utils";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32;
const INDENT_OFFSET = 18;

export function Results({
  items,
  toggle,
  path,
  onItemClick,
}: {
  items: FlatItem[];
  toggle?: (key: string, value?: boolean) => void;
  path: TreePath;
  onItemClick?: (path: TreePath) => void;
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

          const parentIndex = items.findIndex((item) => item.key === parent);
          const parentItem = virtualItems.find(
            (item) => item.index === parentIndex,
          );

          const handleItemSelect = (open?: boolean) => {
            toggle?.(key, open);
            if (value && (!isExpanded || type === "table")) {
              onItemClick?.(value);
            }
          };

          const handleKeyDown = (evt: React.KeyboardEvent<HTMLDivElement>) => {
            if (evt.code === "ArrowDown") {
              ref.current
                ?.querySelector<HTMLDivElement>(`[data-index='${index + 1}']`)
                ?.focus();

              evt.preventDefault();
            }
            if (evt.code === "ArrowRight") {
              handleItemSelect(true);
              evt.preventDefault();
            }
            if (evt.code === "ArrowLeft") {
              handleItemSelect(false);
              evt.preventDefault();
            }
            if (evt.code === "ArrowUp") {
              ref.current
                ?.querySelector<HTMLDivElement>(`[data-index='${index - 1}']`)
                ?.focus();
              evt.preventDefault();
            }
            if (evt.code === "Space" || evt.code === "Enter") {
              handleItemSelect();
              evt.preventDefault();
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
                ref={virtual.measureElement}
                className={cx(S.item, S[type], { [S.active]: isActive })}
                data-index={index}
                data-open={isExpanded}
                tabIndex={0}
                style={{
                  top: start,
                  marginLeft: level * INDENT_OFFSET,
                }}
                data-test-id="tree-item"
                data-type={type}
                onKeyDown={handleKeyDown}
                onClick={() => handleItemSelect()}
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
                  <Icon name={getIconForType(type)} className={S.icon} />
                  {isLoading ? (
                    <Loading />
                  ) : (
                    <Box
                      pl="sm"
                      className={S.label}
                      data-test-id="tree-item-label"
                    >
                      {label}
                    </Box>
                  )}
                </Flex>
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
      radius="sm"
      width={`${w}%`}
      height={12}
      data-test-id="loading-placeholder"
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

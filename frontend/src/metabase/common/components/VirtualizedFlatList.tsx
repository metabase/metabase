import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";

import { Box } from "metabase/ui";

import S from "./VirtualizedFlatList.module.css";

interface VirtualizedFlatListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize?: number;
  selectedId?: number | string;
  getItemId?: (item: T) => number | string;
  className?: string;
}

const DEFAULT_ITEM_HEIGHT = 60;

export function VirtualizedFlatList<T>({
  items,
  renderItem,
  estimateSize = DEFAULT_ITEM_HEIGHT,
  selectedId,
  getItemId,
  className,
}: VirtualizedFlatListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const getScrollElement = useCallback(() => parentRef.current, []);
  const getEstimateSize = useCallback(() => estimateSize, [estimateSize]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (selectedId === undefined || !getItemId) {
      return;
    }
    const index = items.findIndex((item) => getItemId(item) === selectedId);
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedId, items, getItemId, virtualizer]);

  return (
    <Box ref={parentRef} px="md" className={cx(S.scrollContainer, className)}>
      <Box
        className={S.listContainer}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];

          return (
            <Box
              key={virtualRow.key}
              data-index={virtualRow.index}
              className={S.listItem}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderItem(item, virtualRow.index)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

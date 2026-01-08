import { useVirtualizer } from "@tanstack/react-virtual";
import type { Key, ReactNode } from "react";
import { useMemo, useRef } from "react";
import _ from "underscore";

import { Box, type BoxProps, Flex } from "metabase/ui";

type VirtualizedGridItem = {
  key: Key;
  content: ReactNode;
};

type VirtualizedGridProps = {
  items: VirtualizedGridItem[];
  columnsPerRow?: number;
  estimatedRowHeight?: number;
  overscan?: number;
} & Omit<BoxProps, "children">;

export const VirtualizedGrid = ({
  items,
  columnsPerRow = 4,
  estimatedRowHeight = 80,
  overscan = 5,
  ...boxProps
}: VirtualizedGridProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Group items into rows
  const rows = useMemo(
    () => _.chunk(items, columnsPerRow),
    [items, columnsPerRow],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <Box ref={parentRef} h="100%" style={{ overflowY: "auto" }} {...boxProps}>
      <Box h={virtualizer.getTotalSize()} pos="relative">
        {virtualRows.map((virtualRow) => {
          const rowItems = rows[virtualRow.index];
          return (
            <Flex
              key={virtualRow.key}
              pos="absolute"
              top={0}
              left={0}
              w="100%"
              wrap="wrap"
              ml="-0.5rem"
              mr="-0.5rem"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowItems.map((item) => (
                <Box
                  key={item.key}
                  p="0.5rem"
                  style={{ width: `${100 / columnsPerRow}%` }}
                >
                  {item.content}
                </Box>
              ))}
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
};

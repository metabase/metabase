import { useVirtualizer } from "@tanstack/react-virtual";
import type { Key, ReactNode } from "react";
import { useMemo, useRef } from "react";
import _ from "underscore";

import { Box, type BoxProps, Grid, useMatches } from "metabase/ui";
import type { BreakpointName } from "metabase/ui/theme";

type VirtualizedGridProps<T> = {
  items: T[];
  keyExtractor: (item: T) => Key;
  renderItem: (item: T) => ReactNode;
  columnsPerRow: Record<BreakpointName, number>;
  estimatedRowHeight: number;
  overscan?: number;
} & Omit<BoxProps, "children">;

export const VirtualizedGrid = <T,>({
  items,
  keyExtractor,
  renderItem,
  columnsPerRow,
  estimatedRowHeight,
  overscan = 5,
  ...boxProps
}: VirtualizedGridProps<T>) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Use Mantine's useMatches to get the current column count based on breakpoint
  const currentColumns = useMatches(
    {
      base: columnsPerRow.xs,
      sm: columnsPerRow.sm,
      md: columnsPerRow.md,
      lg: columnsPerRow.lg,
      xl: columnsPerRow.xl,
    },
    { getInitialValueInEffect: false },
  );

  // Group items into rows based on current columns
  const rows = useMemo(
    () => _.chunk(items, currentColumns),
    [items, currentColumns],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Calculate span for current breakpoint
  const currentSpan = 12 / currentColumns;

  return (
    <Box ref={parentRef} h="100%" style={{ overflowY: "auto" }} {...boxProps}>
      <Box h={virtualizer.getTotalSize()} pos="relative">
        {virtualRows.map((virtualRow) => {
          const rowItems = rows[virtualRow.index];

          return (
            <Box
              key={virtualRow.key}
              pos="absolute"
              top={0}
              left={0}
              w="100%"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <Grid gutter="md">
                {rowItems.map((item) => (
                  <Grid.Col key={keyExtractor(item)} span={currentSpan}>
                    {renderItem(item)}
                  </Grid.Col>
                ))}
              </Grid>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

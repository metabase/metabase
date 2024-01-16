// Based on https://codesandbox.io/p/sandbox/react-virtualized-responsive-card-grid-7ry39g?file=%2Fsrc%2FVirtualizedGrid.tsx%3A1%2C1-120%2C1

import type { FC } from "react";
import { useEffect, useRef } from "react";
import type {
  AutoSizerProps,
  GridCellProps,
  GridProps,
  WindowScrollerProps,
} from "react-virtualized";
import {
  Grid as _Grid,
  WindowScroller as _WindowScroller,
  AutoSizer as _AutoSizer,
} from "react-virtualized";

const Grid = _Grid as unknown as FC<GridProps>;
const WindowScroller = _WindowScroller as unknown as FC<WindowScrollerProps>;
const AutoSizer = _AutoSizer as unknown as FC<AutoSizerProps>;

export interface VirtualizedGridProps<ItemType> {
  items: ItemType[];
  itemHeight: number;
  renderItem: (props: VirtualizedGridItemProps<ItemType>) => JSX.Element;
  gridGapSize: number;
  scrollElement?: HTMLElement;
  width: number;
  columnWidth: number;
  columnCount: number;
  rowCount: number;
}

export interface VirtualizedGridItemProps<ItemType> extends GridCellProps {
  rowIndex: number;
  items: ItemType[];
  columnCount: number;
  gridGapSize?: number;
  groupLabel?: string;
}

export function VirtualizedGrid<ItemType>({
  items,
  renderItem,
  itemHeight,
  width,
  columnWidth,
  rowCount,
  columnCount,
  gridGapSize,
  scrollElement,
}: VirtualizedGridProps<ItemType>): JSX.Element {
  const gridRef = useRef<_Grid | null>(null);

  useEffect(() => {
    const recomputeGridSize = () => {
      gridRef.current?.recomputeGridSize();
    };
    window.addEventListener("resize", recomputeGridSize);
    return () => window.removeEventListener("resize", recomputeGridSize);
  }, []);

  return (
    <WindowScroller scrollElement={scrollElement}>
      {({ height, isScrolling, onChildScroll, scrollTop }) => (
        <AutoSizer disableHeight>
          {() => {
            return (
              <Grid
                rowCount={rowCount}
                columnCount={columnCount}
                columnWidth={columnWidth}
                width={width}
                gap={gridGapSize}
                ref={gridRef}
                autoHeight
                height={height}
                rowHeight={itemHeight}
                isScrolling={isScrolling}
                scrollTop={scrollTop}
                onScroll={onChildScroll}
                cellRenderer={(props: GridCellProps) => {
                  const fullProps: VirtualizedGridItemProps<ItemType> = {
                    ...props,
                    items,
                    columnCount,
                  };
                  return renderItem(fullProps);
                }}
              />
            );
          }}
        </AutoSizer>
      )}
    </WindowScroller>
  );
}

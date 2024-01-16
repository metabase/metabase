// Based on https://codesandbox.io/p/sandbox/react-virtualized-responsive-card-grid-7ry39g?file=%2Fsrc%2FVirtualizedGrid.tsx%3A1%2C1-120%2C1

import { FC, useEffect, useRef } from "react";
import {
  AutoSizerProps,
  Grid as _Grid,
  GridCellProps,
  GridProps,
  WindowScroller as _WindowScroller,
  AutoSizer as _AutoSizer,
  WindowScrollerProps,
} from "react-virtualized";

const Grid = _Grid as unknown as FC<GridProps>;
const WindowScroller = _WindowScroller as unknown as FC<WindowScrollerProps>;
const AutoSizer = _AutoSizer as unknown as FC<AutoSizerProps>;

export interface VirtualizedGridProps<ItemType> {
  items: ItemType[];
  itemHeight: number;
  renderItem: (props: VirtualizedGridItemProps<ItemType>) => JSX.Element;
  numColumns?: number; // explicitly set number of columns
  gridGapSize: number;
  scrollElement?: HTMLElement;
  width: number;
  columnWidth: number;
  columnCount: number;
  rowCount: number;
}

export interface VirtualizedGridItemProps<ItemType> extends GridCellProps {
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

// const useDimensions = () => {
//   const [dimensions, setDimensions] = useState<{
//     width: number | undefined;
//     height: number | undefined;
//   }>({
//     width: undefined,
//     height: undefined,
//   });

//   useEffect(() => {
//     if (typeof window !== "undefined") {
//       const handleResize = () => {
//         setDimensions({
//           width: window.innerWidth,
//           height: window.innerHeight,
//         });
//       };
//       window.addEventListener("resize", handleResize);
//       handleResize();
//       return () => window.removeEventListener("resize", handleResize);
//     }
//   }, []);
//   return dimensions;
// };

// Based on https://codesandbox.io/p/sandbox/react-virtualized-responsive-card-grid-7ry39g?file=%2Fsrc%2FVirtualizedGrid.tsx%3A1%2C1-120%2C1

import { FC, useEffect, useRef, useState } from "react";
import {
  AutoSizerProps,
  Grid as _Grid,
  GridCellProps,
  GridProps,
  WindowScroller as _WindowScroller,
  AutoSizer as _AutoSizer,
  WindowScrollerProps,
} from "react-virtualized";
import styled  from "@emotion/styled";

const Grid = _Grid as unknown as FC<GridProps>;
const WindowScroller = _WindowScroller as unknown as FC<WindowScrollerProps>;
const AutoSizer = _AutoSizer as unknown as FC<AutoSizerProps>;

export interface VirtualizedGridProps<ItemType> {
  items: ItemType[];
  itemHeight: number;
  itemMinWidth: number;
  renderItem: (props: VirtualizedGridItemProps<ItemType>) => JSX.Element;
  numColumns?: number; // explicitly set number of columns
  gridGapSize: number;
  scrollElement?: HTMLElement;
}

export interface VirtualizedGridItemProps<ItemType> extends GridCellProps {
  items: ItemType[];
  columnCount: number;
  gridGapSize: number;
}

const Container = styled.div`
  flex: 1;
  width: 100%;

  > div {
    height: unset !important;
  }

  // Not sure if this is needed
  overflow: hidden;

  .ReactVirtualized__Grid,
  .ReactVirtualized__Grid__innerScrollContainer {
    overflow: visible !important;
  }

`;

export function VirtualizedGrid<ItemType>({
  items,
  renderItem,
  itemHeight,
  itemMinWidth,
  numColumns,
  gridGapSize,
  scrollElement,
}: VirtualizedGridProps<ItemType>): JSX.Element {
  const gridRef = useRef<_Grid | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const recomputeGridSize = () => {
      gridRef.current?.recomputeGridSize();
    };
    window.addEventListener("resize", recomputeGridSize);
    return () => window.removeEventListener("resize", recomputeGridSize);
  }, []);

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  useEffect(() => {
    const handleResize = () => {
      console.log("handleResize");
      if (containerRef?.current) {
        setContainerWidth(containerRef?.current?.clientWidth);
        console.log(
          "in handleResize, settingContainerWidth to containerRef?.current?.clientWidth",
          containerRef?.current?.clientWidth,
        );
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [containerRef?.current]);

  console.log("containerRef?.current", containerRef?.current);
  console.log(
    "containerRef?.current?.clientWidth",
    containerRef?.current?.clientWidth,
  );

  console.log('scrollElement', scrollElement);
  return (
    <Container ref={containerRef}>
      {
        // Only render this once containerWidth has been set
        containerWidth && (
        <WindowScroller scrollElement={scrollElement}>
          {({ height, isScrolling, onChildScroll, scrollTop }) => (
            <AutoSizer disableHeight>
              {() => {
                const columnCount =
                  numColumns ?? calculateColumnCount(containerWidth);
                const rowCount = Math.ceil(items.length / columnCount);
                const itemWidth = calculateItemWidth(
                  containerWidth,
                  columnCount,
                );
                console.log('itemWidth', itemWidth);
                console.log('containerWidth', containerWidth);
                console.log('columnCount', columnCount);

                return (
                  <Grid
                    gap={gridGapSize}
                    ref={gridRef}
                    autoHeight
                    columnCount={columnCount}
                    columnWidth={itemWidth}
                    width={containerWidth}
                    height={height}
                    rowCount={rowCount}
                    rowHeight={itemHeight}
                    isScrolling={isScrolling}
                    scrollTop={scrollTop}
                    onScroll={onChildScroll}
                    cellRenderer={(props: GridCellProps) => {
                      const fullProps: VirtualizedGridItemProps<ItemType> = {
                        ...props,
                        items,
                        columnCount: columnCount,
                      };
                      return renderItem(fullProps);
                    }}
                  />
                );
              }}
            </AutoSizer>
          )}
        </WindowScroller>
      )}
    </Container>
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

import { useCallback, useMemo, useState } from "react";
import {
  type ItemCallback,
  Responsive as ReactGridLayout,
} from "react-grid-layout";

import { useMantineTheme } from "metabase/ui";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { generateGridBackground } from "./utils";

// We need to omit onLayoutChange and margin from the props of ReactGridLayout
// because we're overriding them in OwnProps
type OmittedPropsFromGridLayout = Omit<
  ReactGridLayout.ResponsiveProps,
  "onLayoutChange" | "margin"
>;
// We need to make cols, width and margin mandatory from the props of ReactGridLayout
type RequiredPropsFromGridLayout = Required<
  Pick<
    ReactGridLayout.ResponsiveProps,
    "cols" | "width" | "margin" | "rowHeight"
  >
>;
type OwnProps<T extends { id: number | null }> = {
  /**
   * Items to render in the grid
   */
  items: T[];

  /**
   * The function that renders the item
   * @param props - the props for the item renderer
   * @param props.item - the item to render
   * @param props.gridItemWidth - the width of the grid item
   * @param props.breakpoint - the current breakpoint
   * @param props.totalNumGridCols - the total number of grid columns
   * @returns the rendered item
   */
  itemRenderer: (props: {
    item: T;
    gridItemWidth: number;
    breakpoint: "desktop" | "mobile";
    totalNumGridCols: number;
  }) => React.ReactNode;

  /**
   * Are we in editing mode?
   */
  isEditing: boolean;

  /**
   * Called when the layout changes
   * @param layout - the new layout
   * @param breakpoint - the current breakpoint
   */
  onLayoutChange: (layout: {
    layout: ReactGridLayout.Layout[];
    breakpoint: "desktop" | "mobile";
  }) => void;

  /**
   * The breakpoints for the grid
   */
  margin?: Record<string, [number, number]>;
};

export function GridLayout<T extends { id: number | null }>(
  props: OwnProps<T> & OmittedPropsFromGridLayout & RequiredPropsFromGridLayout,
) {
  const {
    items,
    itemRenderer,
    breakpoints,
    layouts = {},
    cols: columnsMap = {},
    width: gridWidth = 0,
    margin: marginMap = {},
    rowHeight,
    isEditing,
    onLayoutChange,
    ...otherProps
  } = props;
  const theme = useMantineTheme();

  const [currentBreakpoint, setCurrentBreakpoint] = useState(
    (ReactGridLayout as any).utils.getBreakpointFromWidth(
      breakpoints,
      gridWidth,
    ),
  );

  const [localLayout, setLocalLayout] = useState<ReactGridLayout.Layout[]>();

  const onLayoutChangeWrapped = useCallback(
    (currentLayout: ReactGridLayout.Layout[]) => {
      setLocalLayout(currentLayout);
      onLayoutChange({
        layout: currentLayout,
        // Calculating the breakpoint right here,
        // so we're definitely passing the most recent one
        // Workaround for https://github.com/react-grid-layout/react-grid-layout/issues/889
        breakpoint: (ReactGridLayout as any).utils.getBreakpointFromWidth(
          breakpoints,
          gridWidth,
        ),
      });
    },
    [onLayoutChange, breakpoints, gridWidth],
  );

  const onBreakpointChange = useCallback((newBreakpoint: string) => {
    setCurrentBreakpoint(newBreakpoint);
  }, []);

  const margin = useMemo(
    () => marginMap[currentBreakpoint],
    [marginMap, currentBreakpoint],
  );

  const layout = useMemo(
    () => layouts[currentBreakpoint],
    [layouts, currentBreakpoint],
  );

  const cols = useMemo(
    () => columnsMap[currentBreakpoint],
    [columnsMap, currentBreakpoint],
  );

  const cellSize = useMemo(() => {
    const marginSlotsCount = cols - 1;
    const [horizontalMargin] = margin;
    const totalHorizontalMargin = marginSlotsCount * horizontalMargin;
    const freeSpace = gridWidth - totalHorizontalMargin;

    return {
      width: freeSpace / cols,
      height: rowHeight,
    };
  }, [cols, gridWidth, rowHeight, margin]);

  const renderItem = useCallback(
    (item: T) => {
      const itemLayout = layout.find((l) => String(l.i) === String(item.id));
      if (!itemLayout) {
        return null;
      }

      const gridItemWidth = cellSize.width * itemLayout.w;

      return itemRenderer({
        item,
        gridItemWidth,
        breakpoint: currentBreakpoint,
        totalNumGridCols: cols,
      });
    },
    [layout, cellSize, itemRenderer, currentBreakpoint, cols],
  );

  const height = useMemo(() => {
    // Once `localLayout` is set, use it instead of the prop layout.
    // The prop layout includes all cards (visible and hidden), causing
    // incorrect y/height calculations. `localLayout` only includes visible cards.
    let lowestLayoutCellPoint = Math.max(
      ...(localLayout ?? layout).map((l) => l.y + l.h),
    );
    if (isEditing) {
      lowestLayoutCellPoint += Math.ceil(window.innerHeight / cellSize.height);
    }
    const [_horizontalMargin, verticalMargin] = margin;
    return (cellSize.height + verticalMargin) * lowestLayoutCellPoint;
  }, [localLayout, layout, isEditing, margin, cellSize.height]);

  const background = useMemo(
    () =>
      generateGridBackground({
        cellSize,
        margin,
        cols,
        gridWidth,

        // We cannot use CSS variables here, as the svg data in background-image
        // lives a separate style tree from the rest of the app.
        cellStrokeColor:
          theme.other?.dashboard?.gridBorderColor ??
          theme.fn.themeColor("border"),
      }),
    [cellSize, gridWidth, margin, cols, theme],
  );

  const style = useMemo(
    () => ({
      width: gridWidth,
      height,
      background: isEditing ? background : "",
    }),
    [gridWidth, height, background, isEditing],
  );

  const isMobile = currentBreakpoint === "mobile";

  // https://github.com/react-grid-layout/react-grid-layout#performance
  const children = useMemo(() => items.map(renderItem), [items, renderItem]);

  // Hide text selection during drag without affecting auto-scroll metabase#53842
  const disableTextSelection = useCallback<ItemCallback>(
    (...params) => {
      document.body.classList.add("react-grid-layout-dragging");
      otherProps.onDragStart?.(...params);
    },
    [otherProps],
  );

  const enableTextSelection = useCallback<ItemCallback>(
    (...params) => {
      document.body.classList.remove("react-grid-layout-dragging");
      otherProps.onDragStop?.(...params);
    },
    [otherProps],
  );

  return (
    <ReactGridLayout
      breakpoints={breakpoints}
      cols={columnsMap}
      layouts={layouts}
      width={gridWidth}
      margin={margin}
      rowHeight={rowHeight}
      isDraggable={isEditing && !isMobile}
      isResizable={isEditing && !isMobile}
      {...otherProps}
      autoSize={false}
      onLayoutChange={onLayoutChangeWrapped}
      onBreakpointChange={onBreakpointChange}
      style={style}
      onDragStart={disableTextSelection}
      onDragStop={enableTextSelection}
      onResizeStart={disableTextSelection}
      onResizeStop={enableTextSelection}
      draggableCancel="[data-dontdrag]"
    >
      {children}
    </ReactGridLayout>
  );
}

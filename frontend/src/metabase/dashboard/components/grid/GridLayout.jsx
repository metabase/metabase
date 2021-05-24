/* eslint-disable react/prop-types */
import React, { useCallback, useMemo, useState } from "react";
import { Responsive as ReactGridLayout } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { generateGridBackground } from "./utils";

function GridLayout({
  items,
  itemRenderer,
  breakpoints,
  layouts,
  cols: columnsMap,
  width: gridWidth,
  margin,
  rowHeight,
  isEditing,
  ...props
}) {
  const [currentBreakpoint, setCurrentBreakpoint] = useState(
    ReactGridLayout.utils.getBreakpointFromWidth(breakpoints, gridWidth),
  );

  const onBreakpointChange = useCallback(newBreakpoint => {
    setCurrentBreakpoint(newBreakpoint);
  }, []);

  const layout = useMemo(() => layouts[currentBreakpoint] || layouts["lg"], [
    layouts,
    currentBreakpoint,
  ]);

  const cols = useMemo(() => columnsMap[currentBreakpoint], [
    columnsMap,
    currentBreakpoint,
  ]);

  const cellSize = useMemo(() => {
    const marginSlotsCount = cols - 1;
    const totalHorizontalMargin = marginSlotsCount * margin;
    const freeSpace = gridWidth - totalHorizontalMargin;
    return {
      width: freeSpace / cols,
      height: rowHeight,
    };
  }, [cols, gridWidth, rowHeight, margin]);

  const renderItem = useCallback(
    item => {
      const itemLayout = layout.find(l => String(l.i) === String(item.id));
      const gridItemWidth = cellSize.width * itemLayout.w;
      return itemRenderer({
        item,
        gridItemWidth,
      });
    },
    [layout, cellSize, itemRenderer],
  );

  const height = useMemo(() => {
    let lowestLayoutCellPoint = Math.max(...layout.map(l => l.y + l.h));
    if (isEditing) {
      lowestLayoutCellPoint += Math.ceil(window.innerHeight / cellSize.height);
    }
    return (cellSize.height + margin) * lowestLayoutCellPoint;
  }, [cellSize.height, layout, margin, isEditing]);

  const background = useMemo(
    () => generateGridBackground({ cellSize, margin, cols, gridWidth }),
    [cellSize, gridWidth, margin, cols],
  );

  const style = useMemo(
    () => ({
      width: gridWidth,
      height,
      background: isEditing ? background : "",
    }),
    [gridWidth, height, background, isEditing],
  );

  // https://github.com/react-grid-layout/react-grid-layout#performance
  const children = useMemo(() => items.map(renderItem), [items, renderItem]);

  return (
    <ReactGridLayout
      breakpoints={breakpoints}
      cols={columnsMap}
      layouts={layouts}
      width={gridWidth}
      margin={[margin, margin]}
      rowHeight={rowHeight}
      isDraggable={isEditing}
      isResizable={isEditing}
      {...props}
      autoSize={false}
      onBreakpointChange={onBreakpointChange}
      style={style}
    >
      {children}
    </ReactGridLayout>
  );
}

export default GridLayout;

/* eslint-disable react/prop-types */
import React, { useCallback, useMemo } from "react";
import ReactGridLayout from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { generateGridBackground } from "./utils";

function GridLayout({
  items,
  itemRenderer,
  layout,
  cols,
  width: gridWidth,
  margin,
  rowHeight,
  isEditing,
  ...props
}) {
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
      const gridItemWidth = cellSize.width * itemLayout.w - margin;
      return itemRenderer({
        item,
        gridItemWidth,
      });
    },
    [layout, cellSize, margin, itemRenderer],
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

  return (
    <ReactGridLayout
      cols={cols}
      layout={layout}
      width={gridWidth}
      margin={[margin, margin]}
      rowHeight={rowHeight}
      isDraggable={isEditing}
      isResizable={isEditing}
      {...props}
      autoSize={false}
      style={style}
    >
      {items.map(renderItem)}
    </ReactGridLayout>
  );
}

export default GridLayout;

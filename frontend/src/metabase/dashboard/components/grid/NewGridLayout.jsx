/* eslint-disable react/prop-types */
import React, { useCallback, useMemo } from "react";
import ReactGridLayout from "react-grid-layout";
import _ from "underscore";

import { color } from "metabase/lib/colors";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

function NewGridLayout({
  items,
  itemRenderer,
  layout,
  cols,
  width: gridWidth,
  margin,
  rowHeight,
  isEditing,
  className,
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

  const background = useMemo(() => {
    const XMLNS = "http://www.w3.org/2000/svg";
    const rowHeight = cellSize.height + margin;
    const cellStrokeColor = color("border");

    const y = 0;
    const w = cellSize.width;
    const h = cellSize.height;

    const rectangles = _(cols).times(i => {
      const x = i * (cellSize.width + margin);
      return `<rect stroke='${cellStrokeColor}' stroke-width='1' fill='none' x='${x}' y='${y}' width='${w}' height='${h}'/>`;
    });

    const svg = [
      `<svg xmlns='${XMLNS}' width='${gridWidth}' height='${rowHeight}'>`,
      ...rectangles,
      `</svg>`,
    ].join("");

    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [cellSize, gridWidth, margin, cols]);

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
    const cardVerticalMargin = margin * 2;
    const lowestLayoutCellPoint = Math.max(...layout.map(l => l.y + l.h));
    if (!isEditing) {
      const extraVerticalPadding = margin * 2;
      return (
        cellSize.height * lowestLayoutCellPoint +
        cardVerticalMargin +
        extraVerticalPadding
      );
    }
    // one vertical screen worth of rows ensuring the grid fills the screen
    const lowestWindowCellPoint = Math.ceil(
      window.innerHeight / cellSize.height,
    );
    return (
      cellSize.height * (lowestLayoutCellPoint + lowestWindowCellPoint) +
      cardVerticalMargin
    );
  }, [cellSize.height, layout, margin, isEditing]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: gridWidth,
        height,
        background: isEditing ? background : "",
      }}
    >
      <ReactGridLayout
        cols={cols}
        layout={layout}
        width={gridWidth}
        margin={[margin, margin]}
        rowHeight={rowHeight}
        isDraggable={isEditing}
        isResizable={isEditing}
        {...props}
      >
        {items.map(renderItem)}
      </ReactGridLayout>
    </div>
  );
}

export default NewGridLayout;

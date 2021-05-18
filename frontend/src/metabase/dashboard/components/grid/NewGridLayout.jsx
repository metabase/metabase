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
  const cellSize = useMemo(
    () => ({
      width: gridWidth / cols,
      height: rowHeight,
    }),
    [cols, gridWidth, rowHeight],
  );

  const background = useMemo(() => {
    const XMLNS = "http://www.w3.org/2000/svg";
    const rowWidth = cellSize.width * cols;
    const rowHeight = cellSize.height + margin;
    const cellStrokeColor = color("border");

    // Aligns rectangles so their borders get hidden
    // when dashboard cards overlap them
    // As we are offsetting the layout,
    // we must subtract the offset value evenly from the size of each element
    // to fit within the dimensions of the grid
    const offsetX = margin / 2;
    const offsetY = margin;
    const fractionX = offsetX / cols;
    const fractionY = offsetY / cols;

    const actualCellWidth = Math.round(cellSize.width - margin);

    const y = offsetY;
    const w = actualCellWidth - fractionX;
    const h = cellSize.height - fractionY;

    const rectangles = _(cols).times(i => {
      const x = i * cellSize.width + offsetX;
      return `<rect stroke='${cellStrokeColor}' stroke-width='1' fill='none' x='${x}' y='${y}' width='${w}' height='${h}'/>`;
    });

    const svg = [
      `<svg xmlns='${XMLNS}' width='${rowWidth}' height='${rowHeight}'>`,
      ...rectangles,
      `</svg>`,
    ].join("");

    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [cellSize, margin, cols]);

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

  const minEditingHeight = useMemo(() => {
    const lowestLayoutCellPoint = Math.max(...layout.map(l => l.y + l.h));
    // one vertical screen worth of rows ensuring the grid fills the screen
    const lowestWindowCellPoint = Math.ceil(
      window.innerHeight / cellSize.height,
    );
    return cellSize.height * (lowestLayoutCellPoint + lowestWindowCellPoint);
  }, [cellSize.height, layout]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: cellSize.width * cols,
        minHeight: isEditing ? minEditingHeight : "auto",
        background: isEditing ? background : "",
      }}
    >
      <ReactGridLayout
        cols={cols}
        layout={layout}
        width={cellSize.width * cols}
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

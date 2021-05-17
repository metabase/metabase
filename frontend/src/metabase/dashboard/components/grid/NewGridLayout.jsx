/* eslint-disable react/prop-types */
import React, { useCallback, useMemo } from "react";
import ReactGridLayout from "react-grid-layout";
import _ from "underscore";

import { color } from "metabase/lib/colors";

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
      width: (gridWidth + margin) / cols,
      height: rowHeight,
    }),
    [cols, gridWidth, margin, rowHeight],
  );

  const background = useMemo(() => {
    const XMLNS = "http://www.w3.org/2000/svg";
    const fullWidth = cellSize.width * cols;
    const cellStrokeColor = color("border");

    const rectangles = _(cols).times(i => {
      const x = Math.round(margin / 2 + i * cellSize.width);
      const y = margin / 2;
      const w = Math.round(cellSize.width - margin);
      const h = cellSize.height - margin;
      return `<rect stroke='${cellStrokeColor}' stroke-width='1' fill='none' x='${x}' y='${y}' width='${w}' height='${h}'/>`;
    });

    const svg = [
      `<svg xmlns='${XMLNS}' width='${fullWidth}' height='${cellSize.height}'>`,
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
        width: gridWidth,
        minHeight: isEditing ? minEditingHeight : "auto",
        background: isEditing ? background : "",

        // subtract half of a margin to ensure it lines up with the edges
        marginLeft: -margin / 2,
        marginRight: -margin / 2,
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

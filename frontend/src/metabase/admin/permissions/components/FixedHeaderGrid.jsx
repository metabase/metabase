/* eslint-disable react/display-name */

import React from "react";

import { Grid, ScrollSync } from "react-virtualized";
import "react-virtualized/styles.css";
import S from "./FixedHeaderGrid.css";

import cx from "classnames";

const FixedHeaderGrid = ({
  className,
  rowCount,
  columnCount,
  renderCell,
  columnWidth,
  rowHeight,
  columnHeaderHeight,
  rowHeaderWidth,
  renderColumnHeader = () => null,
  renderRowHeader = () => null,
  renderCorner = () => null,
  width,
  height,
  paddingBottom = 0,
  paddingRight = 0,
}) => (
  <div className={cx(className, S.fixedHeaderGrid, "relative")}>
    <ScrollSync>
      {({
        clientHeight,
        clientWidth,
        onScroll,
        scrollHeight,
        scrollLeft,
        scrollTop,
        scrollWidth,
      }) => (
        <div>
          {/* CORNER */}
          <div
            className="scroll-hide-all"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: rowHeaderWidth,
              height: columnHeaderHeight,
              overflow: "hidden",
            }}
          >
            {renderCorner()}
          </div>
          {/* COLUMN HEADERS */}
          <div
            className="scroll-hide-all"
            style={{
              position: "absolute",
              top: 0,
              left: rowHeaderWidth,
              height: columnHeaderHeight,
              overflow: "hidden",
            }}
          >
            <Grid
              width={width - rowHeaderWidth}
              height={columnHeaderHeight}
              cellRenderer={({ key, style, columnIndex, rowIndex }) => (
                <div key={key} style={style}>
                  {/*  HACK: pad the right with a phantom cell */}
                  {columnIndex >= columnCount
                    ? null
                    : renderColumnHeader({ columnIndex })}
                </div>
              )}
              columnCount={columnCount + 1}
              columnWidth={({ index }) =>
                index >= columnCount ? paddingRight : columnWidth
              }
              rowCount={1}
              rowHeight={columnHeaderHeight}
              onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
              scrollLeft={scrollLeft}
            />
          </div>
          {/* ROW HEADERS */}
          <div
            className="scroll-hide-all"
            style={{
              position: "absolute",
              top: columnHeaderHeight,
              left: 0,
              width: rowHeaderWidth,
              overflow: "hidden",
            }}
          >
            <Grid
              width={rowHeaderWidth}
              height={height - columnHeaderHeight}
              cellRenderer={({ key, style, columnIndex, rowIndex }) => (
                <div key={key} style={style}>
                  {/*  HACK: pad the bottom with a phantom cell */}
                  {rowIndex >= rowCount ? null : renderRowHeader({ rowIndex })}
                </div>
              )}
              columnCount={1}
              columnWidth={rowHeaderWidth}
              rowCount={rowCount + 1}
              rowHeight={({ index }) =>
                index >= rowCount ? paddingBottom : rowHeight
              }
              onScroll={({ scrollTop }) => onScroll({ scrollTop })}
              scrollTop={scrollTop}
            />
          </div>
          {/* CELLS */}
          <div
            style={{
              position: "absolute",
              top: columnHeaderHeight,
              left: rowHeaderWidth,
              overflow: "hidden",
            }}
          >
            <Grid
              width={width - rowHeaderWidth}
              height={height - columnHeaderHeight}
              cellRenderer={({ key, style, columnIndex, rowIndex }) => (
                <div key={key} style={style}>
                  {/*  HACK: pad the bottom/right with a phantom cell */}
                  {rowIndex >= rowCount || columnIndex >= columnCount
                    ? null
                    : renderCell({ columnIndex, rowIndex })}
                </div>
              )}
              columnCount={columnCount + 1}
              columnWidth={({ index }) =>
                index >= columnCount ? paddingRight : columnWidth
              }
              rowCount={rowCount + 1}
              rowHeight={({ index }) =>
                index >= rowCount ? paddingBottom : rowHeight
              }
              onScroll={({ scrollTop, scrollLeft }) =>
                onScroll({ scrollTop, scrollLeft })
              }
              scrollTop={scrollTop}
              scrollLeft={scrollLeft}
            />
          </div>
        </div>
      )}
    </ScrollSync>
  </div>
);

export default FixedHeaderGrid;

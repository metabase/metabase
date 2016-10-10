/* eslint-disable react/display-name */

import React, { Component, PropTypes } from "react";

import { Grid, ScrollSync } from 'react-virtualized'
import 'react-virtualized/styles.css';
import S from "./FixedHeaderGrid.css";

import cx from "classnames";

// exact size doesn't matter, just needs to be wider than scrollbars to hide them
const SCROLLBAR_SIZE = 50;

const FixedHeaderGrid = ({
    className,
    rowCount,
    columnCount,
    renderCell,
    columnWidth,
    rowHeight,
    renderColumnHeader,
    columnHeaderHeight,
    rowHeaderWidth,
    renderRowHeader,
    renderCorner,
    width,
    height,
    paddingBottom = 25
}) =>
    <div className={cx(className, S.fixedHeaderGrid, "relative")}>
        <ScrollSync>
            {({ clientHeight, clientWidth, onScroll, scrollHeight, scrollLeft, scrollTop, scrollWidth }) =>
                <div>
                    {/* CORNER */}
                    <div style={{ position: "absolute", top: 0, left: 0, width: rowHeaderWidth, height: columnHeaderHeight, overflow: "hidden" }}>
                        {renderCorner()}
                    </div>
                    {/* COLUMN HEADERS */}
                    <div style={{ position: "absolute", top: 0, left: rowHeaderWidth, height: columnHeaderHeight, overflow: "hidden" }}>
                        <Grid
                            width={width - rowHeaderWidth}
                            height={columnHeaderHeight + SCROLLBAR_SIZE}
                            cellRenderer={({ key, style, columnIndex, rowIndex }) =>
                                <div key={key} style={style}>
                                    {/* HACK: offsets the additional height needed to hide the scrollbars */}
                                    <div style={{ height: columnHeaderHeight, position: "relative" }}>
                                        {renderColumnHeader({ columnIndex })}
                                    </div>
                                </div>
                            }
                            columnCount={columnCount}
                            rowCount={1}
                            columnWidth={columnWidth}
                            rowHeight={columnHeaderHeight + SCROLLBAR_SIZE}
                            onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                            scrollLeft={scrollLeft}
                        />
                    </div>
                    {/* ROW HEADERS */}
                    <div style={{ position: "absolute", top: columnHeaderHeight, left: 0, width: rowHeaderWidth, overflow: "hidden" }}>
                        <Grid
                            width={rowHeaderWidth + SCROLLBAR_SIZE}
                            height={height - columnHeaderHeight}
                            cellRenderer={({ key, style, columnIndex, rowIndex }) =>
                                <div key={key} style={style}>
                                    {/* HACK: offsets the additional width needed to hide the scrollbars */}
                                    <div style={{ width: rowHeaderWidth, position: "relative" }}>
                                        {/*  HACK: pad the bottom with a phantom cell */}
                                        {rowIndex >= rowCount ? null : renderRowHeader({ rowIndex })}
                                    </div>
                                </div>
                            }
                            columnCount={1}
                            rowCount={rowCount + 1}
                            columnWidth={rowHeaderWidth + SCROLLBAR_SIZE}
                            rowHeight={(index) => index >= rowCount ? paddingBottom : rowHeight}
                            onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                            scrollTop={scrollTop}
                        />
                    </div>
                    {/* CELLS */}
                    <div style={{ position: "absolute", top: columnHeaderHeight, left: rowHeaderWidth, overflow: "hidden" }}>
                        <Grid
                            width={width - rowHeaderWidth}
                            height={height - columnHeaderHeight}
                            cellRenderer={({ key, style, columnIndex, rowIndex }) =>
                                <div key={key} style={style}>
                                    {/*  HACK: pad the bottom with a phantom cell */}
                                    {rowIndex >= rowCount ? null : renderCell({ columnIndex, rowIndex })}
                                </div>
                            }
                            columnCount={columnCount}
                            rowCount={rowCount + 1}
                            columnWidth={columnWidth}
                            rowHeight={(index) => index >= rowCount ? paddingBottom : rowHeight}
                            onScroll={({ scrollTop, scrollLeft }) => onScroll({ scrollTop, scrollLeft })}
                            scrollTop={scrollTop}
                            scrollLeft={scrollLeft}
                        />
                    </div>
                </div>
            }
        </ScrollSync>
    </div>

export default FixedHeaderGrid;

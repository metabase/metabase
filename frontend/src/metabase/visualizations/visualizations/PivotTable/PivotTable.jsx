/* eslint-disable react/prop-types */
import React, {
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import { Grid, Collection, ScrollSync, AutoSizer } from "react-virtualized";
import { findDOMNode } from "react-dom";
import { connect } from "react-redux";

import { getScrollBarSize } from "metabase/lib/dom";
import { getSetting } from "metabase/selectors/settings";
import { useOnMount } from "metabase/hooks/use-on-mount";

import {
  COLUMN_SHOW_TOTALS,
  isPivotGroupColumn,
  multiLevelPivot,
} from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";

import { PLUGIN_SELECTORS } from "metabase/plugins";

import { RowToggleIcon } from "./RowToggleIcon";
import {
  Cell,
  TopHeaderCell,
  LeftHeaderCell,
  BodyCell,
} from "./PivotTableCell";

import {
  PivotTableRoot,
  PivotTableTopLeftCellsContainer,
} from "./PivotTable.styled";

import {
  getLeftHeaderWidths,
  databaseSupportsPivotTables,
  isSensible,
  checkRenderable,
} from "./utils";

import { CELL_WIDTH, CELL_HEIGHT, LEFT_HEADER_LEFT_SPACING } from "./constants";
import { settings, _columnSettings as columnSettings } from "./settings";

const mapStateToProps = state => ({
  hasCustomColors: PLUGIN_SELECTORS.getHasCustomColors(state),
  fontFamily: getSetting(state, "application-font"),
});

function PivotTable({
  data,
  settings,
  width,
  hasCustomColors,
  onUpdateVisualizationSettings,
  isNightMode,
  isDashboard,
  fontFamily,
  onVisualizationClick,
}) {
  const [gridElement, setGridElement] = useState(null);
  const bodyRef = useRef(null);
  const leftHeaderRef = useRef(null);
  const topHeaderRef = useRef(null);

  const getColumnTitle = useCallback(
    function (columnIndex) {
      const columns = data.cols.filter(col => !isPivotGroupColumn(col));
      const { column, column_title: columnTitle } = settings.column(
        columns[columnIndex],
      );
      return columnTitle || formatColumn(column);
    },
    [data, settings],
  );

  function isColumnCollapsible(columnIndex) {
    const columns = data.cols.filter(col => !isPivotGroupColumn(col));
    const { [COLUMN_SHOW_TOTALS]: showTotals } = settings.column(
      columns[columnIndex],
    );
    return showTotals;
  }

  useEffect(() => {
    // This is needed in case the cell counts didn't change, but the data did
    leftHeaderRef.current &&
      leftHeaderRef.current.recomputeCellSizesAndPositions();
    topHeaderRef.current &&
      topHeaderRef.current.recomputeCellSizesAndPositions();
  }, [data, leftHeaderRef, topHeaderRef]);

  useOnMount(() => {
    setGridElement(bodyRef.current && findDOMNode(bodyRef.current));
  });

  const pivoted = useMemo(() => {
    if (data == null || !data.cols.some(isPivotGroupColumn)) {
      return null;
    }

    try {
      return multiLevelPivot(data, settings);
    } catch (e) {
      console.warn(e);
    }
    return {};
  }, [data, settings]);

  // In cases where there are horizontal scrollbars are visible AND the data grid has to scroll vertically as well,
  // the left sidebar and the main grid can get out of ScrollSync due to slightly differing heights
  function scrollBarOffsetSize() {
    if (!gridElement) {
      return 0;
    }
    // get the size of the scrollbars
    const scrollBarSize = getScrollBarSize();
    const scrollsHorizontally =
      gridElement.scrollWidth > parseInt(gridElement.style.width);

    if (scrollsHorizontally && scrollBarSize > 0) {
      return scrollBarSize;
    } else {
      return 0;
    }
  }

  const {
    leftHeaderItems,
    topHeaderItems,
    rowCount,
    columnCount,
    rowIndex,
    getRowSection,
    rowIndexes,
    columnIndexes,
    valueIndexes,
  } = pivoted ?? {};

  const { leftHeaderWidths, totalHeaderWidths } = useMemo(() => {
    if (!rowIndexes) {
      return {};
    }

    return getLeftHeaderWidths({
      rowIndexes: rowIndexes,
      getColumnTitle: idx => getColumnTitle(idx),
      fontFamily: fontFamily,
    });
  }, [rowIndexes, fontFamily, getColumnTitle]);

  if (pivoted === null) {
    return null;
  }

  const leftHeaderCellSizeAndPositionGetter = ({ index }) => {
    const { offset, span, depth, maxDepthBelow } = leftHeaderItems[index];

    const columnsToSpan = rowIndexes.length - depth - maxDepthBelow;

    // add up all the widths of the columns, other than itself, that this cell spans
    const spanWidth = leftHeaderWidths
      .slice(depth + 1, depth + columnsToSpan)
      .reduce((acc, cellWidth) => acc + cellWidth, 0);
    const columnPadding = depth === 0 ? LEFT_HEADER_LEFT_SPACING : 0;
    const columnWidth = leftHeaderWidths[depth];

    return {
      height: span * CELL_HEIGHT,
      width: columnWidth + spanWidth + columnPadding,
      x:
        leftHeaderWidths
          .slice(0, depth)
          .reduce((acc, cellWidth) => acc + cellWidth, 0) +
        (depth > 0 ? LEFT_HEADER_LEFT_SPACING : 0),
      y: offset * CELL_HEIGHT,
    };
  };

  const topHeaderRows =
    columnIndexes.length + (valueIndexes.length > 1 ? 1 : 0) || 1;
  const topHeaderHeight = topHeaderRows * CELL_HEIGHT;

  const topHeaderCellSizeAndPositionGetter = ({ index }) => {
    const { offset, span, maxDepthBelow } = topHeaderItems[index];
    return {
      height: CELL_HEIGHT,
      width: span * CELL_WIDTH,
      x: offset * CELL_WIDTH,
      y: (topHeaderRows - maxDepthBelow - 1) * CELL_HEIGHT,
    };
  };

  const leftHeaderWidth =
    rowIndexes.length > 0 ? LEFT_HEADER_LEFT_SPACING + totalHeaderWidths : 0;

  function getCellClickHandler(clicked) {
    if (!clicked) {
      return null;
    }
    return e =>
      onVisualizationClick({
        ...clicked,
        event: e.nativeEvent,
        settings,
      });
  }

  return (
    <PivotTableRoot
      isDashboard={isDashboard}
      isNightMode={isNightMode}
      data-testid="pivot-table"
    >
      <ScrollSync>
        {({ onScroll, scrollLeft, scrollTop }) => (
          <div className="full-height flex flex-column">
            <div className="flex" style={{ height: topHeaderHeight }}>
              {/* top left corner - displays left header columns */}
              <PivotTableTopLeftCellsContainer
                isNightMode={isNightMode}
                style={{
                  width: leftHeaderWidth,
                }}
              >
                {rowIndexes.map((rowIndex, index) => (
                  <Cell
                    key={rowIndex}
                    isEmphasized
                    isBold
                    isBorderedHeader
                    isTransparent
                    hasTopBorder={topHeaderRows > 1}
                    isNightMode={isNightMode}
                    value={getColumnTitle(rowIndex)}
                    style={{
                      flex: "0 0 auto",
                      width:
                        leftHeaderWidths?.[index] +
                        (index === 0 ? LEFT_HEADER_LEFT_SPACING : 0),
                      ...(index === 0
                        ? { paddingLeft: LEFT_HEADER_LEFT_SPACING }
                        : {}),
                      ...(index === rowIndexes.length - 1
                        ? { borderRight: "none" }
                        : {}),
                    }}
                    icon={
                      // you can only collapse before the last column
                      index < rowIndexes.length - 1 &&
                      isColumnCollapsible(rowIndex) && (
                        <RowToggleIcon
                          value={index + 1}
                          settings={settings}
                          updateSettings={onUpdateVisualizationSettings}
                          hasCustomColors={hasCustomColors}
                          isNightMode={isNightMode}
                        />
                      )
                    }
                  />
                ))}
              </PivotTableTopLeftCellsContainer>
              {/* top header */}
              <Collection
                ref={topHeaderRef}
                className="scroll-hide-all"
                isNightMode={isNightMode}
                width={width - leftHeaderWidth}
                height={topHeaderHeight}
                cellCount={topHeaderItems.length}
                cellRenderer={({ index, style, key }) => (
                  <TopHeaderCell
                    key={key}
                    style={style}
                    item={topHeaderItems[index]}
                    getCellClickHandler={getCellClickHandler}
                    isNightMode={isNightMode}
                  />
                )}
                cellSizeAndPositionGetter={topHeaderCellSizeAndPositionGetter}
                onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                scrollLeft={scrollLeft}
              />
            </div>
            <div className="flex flex-full">
              {/* left header */}
              <div style={{ width: leftHeaderWidth }}>
                <AutoSizer disableWidth>
                  {({ height }) => (
                    <Collection
                      ref={leftHeaderRef}
                      className="scroll-hide-all"
                      cellCount={leftHeaderItems.length}
                      cellRenderer={({ index, style, key }) => (
                        <LeftHeaderCell
                          key={key}
                          style={style}
                          item={leftHeaderItems[index]}
                          rowIndex={rowIndex}
                          onUpdateVisualizationSettings={
                            onUpdateVisualizationSettings
                          }
                          settings={settings}
                          isNightMode={isNightMode}
                          getCellClickHandler={getCellClickHandler}
                        />
                      )}
                      cellSizeAndPositionGetter={
                        leftHeaderCellSizeAndPositionGetter
                      }
                      width={leftHeaderWidth}
                      height={height - scrollBarOffsetSize()}
                      scrollTop={scrollTop}
                      onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                    />
                  )}
                </AutoSizer>
              </div>
              {/* pivot table body */}
              <div>
                <AutoSizer disableWidth>
                  {({ height }) => (
                    <Grid
                      width={width - leftHeaderWidth}
                      height={height}
                      className="text-dark"
                      rowCount={rowCount}
                      columnCount={columnCount}
                      rowHeight={CELL_HEIGHT}
                      columnWidth={valueIndexes.length * CELL_WIDTH}
                      cellRenderer={({ rowIndex, columnIndex, key, style }) => (
                        <BodyCell
                          key={key}
                          style={style}
                          rowSection={getRowSection(columnIndex, rowIndex)}
                          isNightMode={isNightMode}
                          getCellClickHandler={getCellClickHandler}
                        />
                      )}
                      onScroll={({ scrollLeft, scrollTop }) =>
                        onScroll({ scrollLeft, scrollTop })
                      }
                      ref={bodyRef}
                      scrollTop={scrollTop}
                      scrollLeft={scrollLeft}
                    />
                  )}
                </AutoSizer>
              </div>
            </div>
          </div>
        )}
      </ScrollSync>
    </PivotTableRoot>
  );
}

export default Object.assign(connect(mapStateToProps)(PivotTable), {
  uiName: t`Pivot Table`,
  identifier: "pivot",
  iconName: "pivot_table",
  databaseSupportsPivotTables,
  isSensible,
  checkRenderable,
  settings,
  columnSettings,
  isLiveResizable: () => false,
  seriesAreCompatible: () => false,
});

export { PivotTable };

import React, {
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import { Grid, Collection, ScrollSync, AutoSizer } from "react-virtualized";
import type { OnScrollParams } from "react-virtualized";
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

import type { DatasetData } from "metabase-types/types/Dataset";
import type { VisualizationSettings } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { PivotTableClicked } from "./types";

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
  leftHeaderCellSizeAndPositionGetter,
  topHeaderCellSizeAndPositionGetter,
} from "./utils";

import { CELL_WIDTH, CELL_HEIGHT, LEFT_HEADER_LEFT_SPACING } from "./constants";
import { settings, _columnSettings as columnSettings } from "./settings";

const mapStateToProps = (state: State) => ({
  fontFamily: getSetting(state, "application-font"),
});

interface PivotTableProps {
  data: DatasetData;
  settings: VisualizationSettings;
  width: number;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  isNightMode: boolean;
  isDashboard: boolean;
  fontFamily?: string;
  onVisualizationClick: (options: any) => void;
}

function PivotTable({
  data,
  settings,
  width,
  onUpdateVisualizationSettings,
  isNightMode,
  isDashboard,
  fontFamily,
  onVisualizationClick,
}: PivotTableProps) {
  const [gridElement, setGridElement] = useState<HTMLElement | null>(null);
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

  function isColumnCollapsible(columnIndex: number) {
    const columns = data.cols.filter(col => !isPivotGroupColumn(col));
    const { [COLUMN_SHOW_TOTALS]: showTotals } = settings.column(
      columns[columnIndex],
    );
    return showTotals;
  }

  useEffect(() => {
    // This is needed in case the cell counts didn't change, but the data did
    (
      leftHeaderRef.current as Collection | null
    )?.recomputeCellSizesAndPositions?.();
    (
      topHeaderRef.current as Collection | null
    )?.recomputeCellSizesAndPositions?.();
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
    return null;
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

  const { leftHeaderWidths, totalHeaderWidths } = useMemo(() => {
    if (!pivoted?.rowIndexes) {
      return { leftHeaderWidths: null, totalHeaderWidths: null };
    }

    return getLeftHeaderWidths({
      rowIndexes: pivoted?.rowIndexes,
      getColumnTitle: idx => getColumnTitle(idx),
      leftHeaderItems: pivoted?.leftHeaderItems,
      fontFamily: fontFamily,
    });
  }, [
    pivoted?.rowIndexes,
    pivoted?.leftHeaderItems,
    fontFamily,
    getColumnTitle,
  ]);

  if (pivoted === null) {
    return null;
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
  } = pivoted;

  const topHeaderRows =
    columnIndexes.length + (valueIndexes.length > 1 ? 1 : 0) || 1;

  const topHeaderHeight = topHeaderRows * CELL_HEIGHT;

  const leftHeaderWidth =
    rowIndexes.length > 0
      ? LEFT_HEADER_LEFT_SPACING + (totalHeaderWidths ?? 0)
      : 0;

  function getCellClickHandler(clicked: PivotTableClicked) {
    if (!clicked) {
      return undefined;
    }
    return (e: React.SyntheticEvent) =>
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
                {rowIndexes.map((rowIndex: number, index: number) => (
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
                        (leftHeaderWidths?.[index] ?? 0) +
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
                cellSizeAndPositionGetter={({ index }) =>
                  topHeaderCellSizeAndPositionGetter(
                    topHeaderItems[index],
                    topHeaderRows,
                  )
                }
                onScroll={({ scrollLeft }) =>
                  onScroll({ scrollLeft } as OnScrollParams)
                }
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
                      cellSizeAndPositionGetter={({ index }) =>
                        leftHeaderCellSizeAndPositionGetter(
                          leftHeaderItems[index],
                          leftHeaderWidths ?? [0],
                          rowIndexes,
                        )
                      }
                      width={leftHeaderWidth}
                      height={height - scrollBarOffsetSize()}
                      scrollTop={scrollTop}
                      onScroll={({ scrollTop }) =>
                        onScroll({ scrollTop } as OnScrollParams)
                      }
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
                        onScroll({ scrollLeft, scrollTop } as OnScrollParams)
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

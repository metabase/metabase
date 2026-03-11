import { DndContext } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import cx from "classnames";
import type * as React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrevious } from "react-use";
import type { OnScrollParams } from "react-virtualized";
import { AutoSizer, Collection, Grid, ScrollSync } from "react-virtualized";
import { t } from "ttag";
import _ from "underscore";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { sumArray } from "metabase/lib/arrays";
import {
  COLUMN_SHOW_TOTALS,
  isPivotGroupColumn,
  multiLevelPivot,
} from "metabase/lib/data_grid";
import { getScrollBarSize } from "metabase/lib/dom";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { useMantineTheme } from "metabase/ui";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { State } from "metabase-types/store";

import {
  PivotTableRoot,
  PivotTableTopLeftCellsContainer,
} from "./PivotTable.styled";
import {
  BodyCell,
  Cell,
  LeftHeaderCell,
  TopHeaderCell,
} from "./PivotTableCell";
import { RowToggleIcon } from "./RowToggleIcon";
import {
  CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  LEFT_HEADER_LEFT_SPACING,
  MIN_HEADER_CELL_WIDTH,
  PIVOT_TABLE_BODY_LABEL,
} from "./constants";
import {
  _columnSettings as columnSettings,
  getTitleForColumn,
  settings,
} from "./settings";
import type { HeaderWidthType, PivotTableClicked } from "./types";
import {
  checkRenderable,
  getCellWidthsForSection,
  getLeftHeaderWidths,
  isSensible,
  leftHeaderCellSizeAndPositionGetter,
  topHeaderCellSizeAndPositionGetter,
} from "./utils";

const MIN_USABLE_BODY_WIDTH = 240;

const mapStateToProps = (state: State) => ({
  fontFamily: getSetting(state, "application-font"),
});

const PivotTableInner = forwardRef<HTMLDivElement, VisualizationProps>(
  function PivotTableInner(
    {
      data,
      settings,
      width,
      height,
      onUpdateVisualizationSettings,
      isDashboard,
      fontFamily,
      isEditing,
      onVisualizationClick,
    },
    ref,
  ) {
    const [viewPortWidth, setViewPortWidth] = useState(width);
    const [shouldOverflow, setShouldOverflow] = useState(false);
    const columnWidthSettings = settings["pivot_table.column_widths"];

    const theme = useMantineTheme();

    const [
      { leftHeaderWidths, totalLeftHeaderWidths, valueHeaderWidths },
      setHeaderWidths,
    ] = useState<HeaderWidthType>({
      leftHeaderWidths: null,
      totalLeftHeaderWidths: null,
      valueHeaderWidths: {},
      ...(columnWidthSettings ?? {}),
    });

    const updateHeaderWidths = useCallback(
      (newHeaderWidths: Partial<HeaderWidthType>) => {
        setHeaderWidths((prevHeaderWidths) => ({
          ...prevHeaderWidths,
          ...newHeaderWidths,
        }));

        onUpdateVisualizationSettings({
          "pivot_table.column_widths": {
            leftHeaderWidths,
            totalLeftHeaderWidths,
            valueHeaderWidths,
            ...newHeaderWidths,
          },
        });
      },
      [
        onUpdateVisualizationSettings,
        leftHeaderWidths,
        totalLeftHeaderWidths,
        valueHeaderWidths,
      ],
    );

    const gridRef = useRef<Grid>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const leftHeaderRef = useRef<Collection>(null);
    const topHeaderRef = useRef<Collection>(null);

    const tc = useTranslateContent();

    const getColumnTitle = useCallback(
      function (columnIndex: number) {
        const column = data.cols.filter((col) => !isPivotGroupColumn(col))[
          columnIndex
        ];
        return tc(getTitleForColumn(column, settings));
      },
      [data, settings, tc],
    );

    function isColumnCollapsible(columnIndex: number) {
      const columns = data.cols.filter((col) => !isPivotGroupColumn(col));
      if (typeof settings.column != "function") {
        throw new Error(
          `Invalid pivot table settings format, missing nested column settings: ${JSON.stringify(
            settings,
          )}`,
        );
      }
      const { [COLUMN_SHOW_TOTALS]: showTotals } = settings.column!(
        columns[columnIndex],
      );
      return showTotals;
    }
    useEffect(() => {
      // This is needed in case the cell counts didn't change, but the data or cell sizes did
      (
        leftHeaderRef.current as Collection | null
      )?.recomputeCellSizesAndPositions?.();
      (
        topHeaderRef.current as Collection | null
      )?.recomputeCellSizesAndPositions?.();
      gridRef.current?.recomputeGridSize?.();
    }, [
      data,
      leftHeaderRef,
      topHeaderRef,
      leftHeaderWidths,
      valueHeaderWidths,
    ]);

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

    const previousRowIndexes = usePrevious(pivoted?.rowIndexes);
    const hasColumnWidths = [
      leftHeaderWidths,
      totalLeftHeaderWidths,
      valueHeaderWidths,
    ].every(Boolean);
    const columnsChanged =
      !hasColumnWidths ||
      (previousRowIndexes &&
        !_.isEqual(pivoted?.rowIndexes, previousRowIndexes)) ||
      leftHeaderWidths?.length !== pivoted?.rowIndexes?.length;

    // In cases where there are horizontal scrollbars are visible AND the data grid has to scroll vertically as well,
    // the left sidebar and the main grid can get out of ScrollSync due to slightly differing heights
    function scrollBarOffsetSize() {
      if (!gridContainerRef.current) {
        return 0;
      }
      // get the size of the scrollbars
      const scrollBarSize = getScrollBarSize();
      const scrollsHorizontally =
        gridContainerRef.current.scrollWidth >
        parseInt(gridContainerRef.current.style.width);

      if (scrollsHorizontally && scrollBarSize > 0) {
        return scrollBarSize;
      } else {
        return 0;
      }
    }

    const { fontSize } = theme.other.pivotTable.cell;

    useEffect(() => {
      if (!pivoted?.rowIndexes) {
        setHeaderWidths({
          leftHeaderWidths: null,
          totalLeftHeaderWidths: null,
          valueHeaderWidths,
        });
        return;
      }

      if (columnsChanged) {
        const newLeftHeaderWidths = getLeftHeaderWidths({
          rowIndexes: pivoted?.rowIndexes,
          getColumnTitle: (idx) => getColumnTitle(idx),
          leftHeaderItems: pivoted?.leftHeaderItems,
          font: { fontFamily, fontSize },
        });

        const newColumnWidths = { ...newLeftHeaderWidths, valueHeaderWidths };
        setHeaderWidths(newColumnWidths);

        if (!_.isEqual(newColumnWidths, columnWidthSettings)) {
          onUpdateVisualizationSettings({
            "pivot_table.column_widths": newColumnWidths,
          });
        }
      }
    }, [
      onUpdateVisualizationSettings,
      valueHeaderWidths,
      pivoted,
      fontFamily,
      fontSize,
      getColumnTitle,
      columnsChanged,
      setHeaderWidths,
      columnWidthSettings,
    ]);

    const handleColumnResize = (
      columnType: "value" | "leftHeader",
      columnIndex: number,
      newWidth: number,
    ) => {
      let newColumnWidths: Partial<HeaderWidthType> = {};

      if (columnType === "leftHeader") {
        const newLeftHeaderColumnWidths = [...(leftHeaderWidths as number[])];
        newLeftHeaderColumnWidths[columnIndex] = Math.max(
          newWidth,
          MIN_HEADER_CELL_WIDTH,
        );

        const newTotalWidth = sumArray(newLeftHeaderColumnWidths);

        newColumnWidths = {
          leftHeaderWidths: newLeftHeaderColumnWidths,
          totalLeftHeaderWidths: newTotalWidth,
        };
      } else if (columnType === "value") {
        const newValueHeaderWidths = { ...(valueHeaderWidths ?? {}) };
        newValueHeaderWidths[columnIndex] = Math.max(
          newWidth,
          MIN_HEADER_CELL_WIDTH,
        );

        newColumnWidths = {
          valueHeaderWidths: newValueHeaderWidths,
        };
      }

      updateHeaderWidths(newColumnWidths);
    };

    const leftHeaderWidth =
      (pivoted?.rowIndexes?.length ?? 0) > 0
        ? LEFT_HEADER_LEFT_SPACING + (totalLeftHeaderWidths ?? 0)
        : 0;

    useEffect(() => {
      const availableBodyWidth = width - leftHeaderWidth;
      const fullBodyWidth = sumArray(
        getCellWidthsForSection(
          valueHeaderWidths,
          pivoted?.valueIndexes ?? [],
          0,
        ),
      );

      const minUsableBodyWidth = Math.min(MIN_USABLE_BODY_WIDTH, fullBodyWidth);
      const shouldOverflow = availableBodyWidth < minUsableBodyWidth;
      setShouldOverflow(shouldOverflow);
      if (shouldOverflow) {
        setViewPortWidth(leftHeaderWidth + minUsableBodyWidth);
      } else {
        setViewPortWidth(width);
      }
    }, [
      totalLeftHeaderWidths,
      valueHeaderWidths,
      pivoted?.valueIndexes,
      width,
      leftHeaderWidths,
      leftHeaderWidth,
    ]);

    if (
      pivoted === null ||
      !leftHeaderWidths ||
      (leftHeaderWidths?.length && columnsChanged)
    ) {
      // We have to return an element to assign the ref to it
      return <div ref={ref} />;
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
      columnsWithoutPivotGroup,
    } = pivoted;

    const topHeaderRows =
      columnIndexes.length + (valueIndexes.length > 1 ? 1 : 0) || 1;

    const topHeaderHeight = topHeaderRows * CELL_HEIGHT;
    const bodyHeight = height - topHeaderHeight;
    const topHeaderWidth = viewPortWidth - leftHeaderWidth;

    function getCellClickHandler(clicked: PivotTableClicked) {
      if (!clicked) {
        return undefined;
      }

      // The CLJS code adds `colIdx` to the objects used for click handling instead of the entire column
      // to avoid duplicate column metadata conversions from CLJS data structures to JS objects
      const { colIdx, ...updatedClicked } = clicked;
      if (typeof colIdx === "number") {
        updatedClicked.column = columnsWithoutPivotGroup[colIdx];
        updatedClicked.data ??= [
          {
            value: updatedClicked.value,
            col: columnsWithoutPivotGroup[colIdx] || null,
          },
        ];
      } else if (updatedClicked.data) {
        updatedClicked.data = updatedClicked.data.map(
          ({ colIdx, ...item }) => ({
            ...item,
            col: colIdx !== undefined ? columnsWithoutPivotGroup[colIdx] : null,
          }),
        );
      }

      if (updatedClicked.dimensions) {
        updatedClicked.dimensions = updatedClicked.dimensions.map(
          ({ colIdx, ...item }) => ({
            ...item,
            column:
              colIdx !== undefined ? columnsWithoutPivotGroup[colIdx] : null,
          }),
        );
      }

      return (e: React.MouseEvent) =>
        onVisualizationClick({
          ...updatedClicked,
          event: e.nativeEvent,
          settings,
        });
    }

    return (
      <DndContext modifiers={[restrictToHorizontalAxis]}>
        <PivotTableRoot
          ref={ref}
          shouldOverflow={shouldOverflow}
          shouldHideScrollbars={isEditing && isDashboard}
          isDashboard={isDashboard}
          data-testid="pivot-table"
        >
          <ScrollSync>
            {({ onScroll, scrollLeft, scrollTop }) => (
              <div className={cx(CS.fullHeight, CS.flex, CS.flexColumn)}>
                <div className={CS.flex} style={{ height: topHeaderHeight }}>
                  {/* top left corner - displays left header columns */}
                  <PivotTableTopLeftCellsContainer
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
                        value={getColumnTitle(rowIndex)}
                        onResize={(newWidth: number) =>
                          handleColumnResize("leftHeader", index, newWidth)
                        }
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
                    style={{ minWidth: `${topHeaderWidth}px` }}
                    ref={topHeaderRef}
                    className={CS.scrollHideAll}
                    width={topHeaderWidth}
                    height={topHeaderHeight}
                    cellCount={topHeaderItems.length}
                    cellRenderer={({ index, style, key }) => (
                      <TopHeaderCell
                        key={key}
                        style={style}
                        item={topHeaderItems[index]}
                        getCellClickHandler={getCellClickHandler}
                        onResize={(newWidth: number) =>
                          handleColumnResize(
                            "value",
                            topHeaderItems[index].offset,
                            newWidth,
                          )
                        }
                      />
                    )}
                    cellSizeAndPositionGetter={({ index }) =>
                      topHeaderCellSizeAndPositionGetter(
                        topHeaderItems[index],
                        topHeaderRows,
                        valueHeaderWidths,
                      )
                    }
                    onScroll={({ scrollLeft }) =>
                      onScroll({ scrollLeft } as OnScrollParams)
                    }
                    scrollLeft={scrollLeft}
                  />
                </div>
                <div className={cx(CS.flex, CS.flexFull)}>
                  {/* left header */}
                  <div style={{ width: leftHeaderWidth }}>
                    <AutoSizer disableWidth nonce={window.MetabaseNonce}>
                      {() => (
                        <Collection
                          ref={leftHeaderRef}
                          className={CS.scrollHideAll}
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
                          height={bodyHeight - scrollBarOffsetSize()}
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
                    <AutoSizer disableWidth nonce={window.MetabaseNonce}>
                      {() => (
                        <Grid
                          aria-label={PIVOT_TABLE_BODY_LABEL}
                          width={viewPortWidth - leftHeaderWidth}
                          height={bodyHeight}
                          rowCount={rowCount}
                          columnCount={columnCount}
                          rowHeight={CELL_HEIGHT}
                          columnWidth={({ index }) => {
                            const subColumnWidths = getCellWidthsForSection(
                              valueHeaderWidths,
                              valueIndexes,
                              index,
                            );
                            return sumArray(subColumnWidths);
                          }}
                          estimatedColumnSize={DEFAULT_CELL_WIDTH}
                          cellRenderer={({
                            rowIndex,
                            columnIndex,
                            key,
                            style,
                            isScrolling,
                          }) => {
                            return (
                              <BodyCell
                                key={key}
                                style={style}
                                showTooltip={!isScrolling}
                                rowSection={getRowSection(
                                  columnIndex,
                                  rowIndex,
                                )}
                                getCellClickHandler={getCellClickHandler}
                                cellWidths={getCellWidthsForSection(
                                  valueHeaderWidths,
                                  valueIndexes,
                                  columnIndex,
                                )}
                              />
                            );
                          }}
                          onScroll={({ scrollLeft, scrollTop }) =>
                            onScroll({
                              scrollLeft,
                              scrollTop,
                            } as OnScrollParams)
                          }
                          ref={gridRef}
                          elementRef={gridContainerRef}
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
      </DndContext>
    );
  },
);

export const PivotTableView = ExplicitSize<
  VisualizationProps & {
    className?: string;
  }
>({
  wrapped: false,
  refreshMode: "debounceLeading",
})(PivotTableInner);

export const PivotTable = Object.assign(
  connect(mapStateToProps)(PivotTableView),
  {
    getUiName: () => t`Pivot Table`,
    identifier: "pivot",
    iconName: "pivot_table",
    minSize: getMinSize("pivot"),
    defaultSize: getDefaultSize("pivot"),
    canSavePng: false,
    isSensible,
    checkRenderable,
    settings,
    columnSettings,
    isLiveResizable: () => false,
  },
);

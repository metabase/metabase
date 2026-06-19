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
import { AutoSizer, Collection, Grid } from "react-virtualized";
import { t } from "ttag";
import _ from "underscore";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import {
  Button,
  Center,
  Flex,
  Loader,
  Select,
  Text,
  useMantineTheme,
} from "metabase/ui";
import { sumArray } from "metabase/utils/arrays";
import { getCspNonce } from "metabase/utils/csp";
import { getScrollBarSize } from "metabase/utils/dom";
import {
  BREAKDOWN_DIMENSION_SETTING,
  COLLAPSED_ROWS_SETTING,
  COLUMN_SHOW_TOTALS,
  computeNativePivotTotals,
  getBreakdownOptions,
  isNativePivotData,
  isPivotGroupColumn,
  multiLevelPivot,
} from "metabase/visualizations/lib/data_grid";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import { migratePivotColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";
import type { VisualizationSettings } from "metabase-types/api";

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
import {
  PivotTableTotalsChart,
  type PivotTotal,
} from "./PivotTableTotalsChart";
import { toggleRow } from "./RowToggleIcon";
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
const BREAKDOWN_BAR_HEIGHT = 40;

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
    // When true, the table is replaced by a line chart of the grand Totals.
    const [showTotalsChart, setShowTotalsChart] = useState(false);
    // Shown while a collapse/expand toggle re-pivots the data, which can block
    // the main thread for a noticeable moment on large datasets.
    const [isRecomputing, setIsRecomputing] = useState(false);
    // Body row currently under the cursor, used to draw a full-row hover guide
    // (top + bottom border across every cell in that row). null = none hovered.
    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
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

    // Track which pane is the current scroll leader to prevent feedback loops.
    const scrollLeader = useRef<"grid" | "leftHeader" | "topHeader" | null>(
      null,
    );
    const scrollLeaderTimeout = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    // scrollLeft/scrollTop state for controlled components that still need it.
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    const getScrollingContainer = (
      ref: React.RefObject<Collection | Grid | null>,
    ): HTMLElement | null => {
      // react-virtualized Collection and Grid store their scroll container
      // as _scrollingContainer on the instance.

      return (ref.current as any)?._scrollingContainer ?? null;
    };

    const claimLead = (leader: "grid" | "leftHeader" | "topHeader") => {
      if (scrollLeaderTimeout.current !== null) {
        clearTimeout(scrollLeaderTimeout.current);
      }
      scrollLeader.current = leader;
      // Release lead shortly after scrolling stops so any pane can lead again.
      scrollLeaderTimeout.current = setTimeout(() => {
        scrollLeader.current = null;
      }, 100);
    };

    const handleGridScroll = useCallback(
      ({
        scrollLeft: sl,
        scrollTop: st,
      }: {
        scrollLeft: number;
        scrollTop: number;
      }) => {
        if (scrollLeader.current !== null && scrollLeader.current !== "grid") {
          return;
        }
        claimLead("grid");
        setScrollLeft(sl);
        setScrollTop(st);
        const leftContainer = getScrollingContainer(leftHeaderRef);
        if (leftContainer && leftContainer.scrollTop !== st) {
          leftContainer.scrollTop = st;
        }
        const topContainer = getScrollingContainer(topHeaderRef);
        if (topContainer && topContainer.scrollLeft !== sl) {
          topContainer.scrollLeft = sl;
        }
      },
      [],
    );

    const handleLeftHeaderScroll = useCallback(
      ({ scrollTop: st }: { scrollTop: number }) => {
        if (
          scrollLeader.current !== null &&
          scrollLeader.current !== "leftHeader"
        ) {
          return;
        }
        claimLead("leftHeader");
        setScrollTop(st);
        const gridContainer = getScrollingContainer(gridRef);
        if (gridContainer && gridContainer.scrollTop !== st) {
          gridContainer.scrollTop = st;
        }
      },
      [],
    );

    const handleTopHeaderScroll = useCallback(
      ({ scrollLeft: sl }: { scrollLeft: number }) => {
        if (
          scrollLeader.current !== null &&
          scrollLeader.current !== "topHeader"
        ) {
          return;
        }
        claimLead("topHeader");
        setScrollLeft(sl);
        const gridContainer = getScrollingContainer(gridRef);
        if (gridContainer && gridContainer.scrollLeft !== sl) {
          gridContainer.scrollLeft = sl;
        }
      },
      [],
    );

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

    // For native pivots with 3+ row dimensions, build the breakdown picker:
    // the user chooses which secondary dimension is the active inner breakdown.
    const { breakdownOptions, breakdownValue } = useMemo(() => {
      if (data == null || !isNativePivotData(data.cols)) {
        return { breakdownOptions: [], breakdownValue: null };
      }
      const columnSplit = migratePivotColumnSplitSetting(
        settings["pivot_table.column_split"] ?? {
          rows: [],
          columns: [],
          values: [],
        },
        data.cols,
      );
      const optionNames = getBreakdownOptions(columnSplit);
      if (optionNames.length === 0) {
        return { breakdownOptions: [], breakdownValue: null };
      }
      const colByName = new Map(
        data.cols
          .filter((col) => !isPivotGroupColumn(col))
          .map((col) => [col.name, col]),
      );
      const options = optionNames.map((name) => {
        const col = colByName.get(name);
        return {
          value: name,
          label: col ? tc(getTitleForColumn(col, settings)) : name,
        };
      });
      const stored = settings[BREAKDOWN_DIMENSION_SETTING] as
        | string
        | null
        | undefined;
      const value =
        stored != null && optionNames.includes(stored)
          ? stored
          : optionNames[0];
      return { breakdownOptions: options, breakdownValue: value };
    }, [data, settings, tc]);

    const handleBreakdownChange = useCallback(
      (value: string | null) => {
        if (value != null) {
          onUpdateVisualizationSettings({
            [BREAKDOWN_DIMENSION_SETTING]: value,
          });
        }
      },
      [onUpdateVisualizationSettings],
    );

    // Applying a collapse/expand setting triggers a synchronous re-pivot that
    // can freeze the UI for a moment. Show the loading overlay first, let the
    // browser paint it, then apply the settings update on the next frames so the
    // spinner is visible during the blocking work. `isRecomputing` is cleared by
    // an effect once the new `pivoted` result commits.
    const applyCollapseSettings = useCallback(
      (newSettings: VisualizationSettings) => {
        setIsRecomputing(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            onUpdateVisualizationSettings(newSettings);
          });
        });
      },
      [onUpdateVisualizationSettings],
    );

    // Collapses every collapsible row level (1..N-1) so only the outermost rows
    // remain expanded. Each level is stored as its 1-based index string, the
    // same form the per-level toggle uses (see toggleRow / collapse-level).
    const handleCollapseAllRows = useCallback(
      (rowDimCount: number) => {
        const levels = [];
        for (let level = 1; level < rowDimCount; level++) {
          levels.push(String(level));
        }
        const currentSplit = settings["pivot_table.column_split"];
        applyCollapseSettings({
          // `rows` snapshots the current column split so the collapsed-rows
          // getValue can detect when the split changed; it mirrors what
          // settings.ts stores. Cast to satisfy the field-ref|name union.
          [COLLAPSED_ROWS_SETTING]: {
            value: levels,
            rows: currentSplit?.rows ?? [],
          } as VisualizationSettings[typeof COLLAPSED_ROWS_SETTING],
        });
      },
      [applyCollapseSettings, settings],
    );

    // Grand totals per measure column (weighted for percent columns), used by
    // the "View totals in chart" line-chart view.
    const totals = useMemo(() => {
      if (data == null || !isNativePivotData(data.cols)) {
        return null;
      }
      const columnSplit = migratePivotColumnSplitSetting(
        settings["pivot_table.column_split"] ?? {
          rows: [],
          columns: [],
          values: [],
        },
        data.cols,
      );
      return computeNativePivotTotals(data, columnSplit, settings.column) as
        | PivotTotal[]
        | null;
    }, [data, settings]);

    // The "Totals" row is only rendered when column totals are enabled (CLJS
    // maybe-add-grand-totals-row gates on pivot.show_column_totals, default
    // true). Only offer the chart toggle when that Totals row actually exists.
    const showsColumnTotals = settings["pivot.show_column_totals"] !== false;
    const canShowTotalsChart =
      showsColumnTotals &&
      totals != null &&
      totals.some((tot) => tot.isPercent);

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
      if (data == null) {
        return null;
      }
      // For structured queries the backend adds a pivot-grouping column; for
      // native SQL queries it's absent and multiLevelPivot synthesizes it.
      // Both cases are handled there, which returns null if it can't process.
      try {
        return multiLevelPivot(data, settings);
      } catch (e) {
        console.warn(e);
      }
      return null;
    }, [data, settings]);

    // The re-pivot above has committed; clear the loading overlay.
    useEffect(() => {
      if (isRecomputing) {
        setIsRecomputing(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pivoted]);

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

    const showBreakdownPicker = breakdownOptions.length > 0;
    // "Collapse all rows" only makes sense when there are nested row levels AND
    // at least one of those levels is still expanded. Collapsing all rows stores
    // every collapsible level (1..N-1) as a level-number string; if the current
    // collapsed setting already contains all of them, nothing is expanded, so we
    // hide the button.
    const collapsedRowValues =
      (settings[COLLAPSED_ROWS_SETTING]?.value as
        | (string | number)[]
        | undefined) ?? [];
    const collapsedLevels = new Set(collapsedRowValues.map(String));
    const hasExpandedRows = (() => {
      for (let level = 1; level < rowIndexes.length; level++) {
        if (!collapsedLevels.has(String(level))) {
          return true;
        }
      }
      return false;
    })();
    const canCollapseAllRows = rowIndexes.length > 1 && hasExpandedRows;
    // The toolbar row holds the breakdown picker, the collapse-all button,
    // and/or the chart toggle.
    const showToolbar =
      showBreakdownPicker || canShowTotalsChart || canCollapseAllRows;
    const breakdownBarHeight = showToolbar ? BREAKDOWN_BAR_HEIGHT : 0;

    const topHeaderHeight = topHeaderRows * CELL_HEIGHT;
    const bodyHeight = height - topHeaderHeight - breakdownBarHeight;
    const verticalScrollBarSize =
      rowCount * CELL_HEIGHT > bodyHeight ? getScrollBarSize() : 0;
    const topHeaderWidth =
      viewPortWidth - leftHeaderWidth - verticalScrollBarSize;

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
          <div
            className={cx(CS.fullHeight, CS.flex, CS.flexColumn)}
            style={{ position: "relative" }}
          >
            {isRecomputing && (
              <Center
                data-testid="pivot-table-loading-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 100,
                  // 50%-transparent backdrop (theme background); the spinner
                  // itself stays fully opaque (no element-level opacity).
                  backgroundColor:
                    "color-mix(in srgb, var(--mb-color-background-primary) 50%, transparent)",
                }}
              >
                <Loader />
              </Center>
            )}
            {showToolbar && (
              <Flex
                align="center"
                gap="sm"
                px="md"
                style={{ height: BREAKDOWN_BAR_HEIGHT, flex: "0 0 auto" }}
                data-testid="pivot-table-toolbar"
              >
                {showBreakdownPicker && !showTotalsChart && (
                  <>
                    <Text fw="bold" c="text-secondary" size="sm">
                      {t`Breakdown`}
                    </Text>
                    <Select
                      size="xs"
                      data={breakdownOptions}
                      value={breakdownValue}
                      onChange={handleBreakdownChange}
                      comboboxProps={{ withinPortal: false }}
                      w={200}
                      data-testid="pivot-breakdown-picker"
                    />
                  </>
                )}
                {!showTotalsChart && canCollapseAllRows && (
                  <Button
                    size="xs"
                    variant="subtle"
                    ml="auto"
                    onClick={() => handleCollapseAllRows(rowIndexes.length)}
                    data-testid="pivot-collapse-all-rows"
                  >
                    {t`Collapse all rows`}
                  </Button>
                )}
                {canShowTotalsChart && (
                  <Button
                    size="xs"
                    variant="subtle"
                    ml={
                      !showTotalsChart && canCollapseAllRows
                        ? undefined
                        : "auto"
                    }
                    onClick={() => setShowTotalsChart((v) => !v)}
                    data-testid="pivot-totals-chart-toggle"
                  >
                    {showTotalsChart
                      ? t`Back to pivot table`
                      : t`View totals in chart`}
                  </Button>
                )}
              </Flex>
            )}
            {showTotalsChart && canShowTotalsChart && totals != null ? (
              <PivotTableTotalsChart totals={totals} height={bodyHeight} />
            ) : (
              <>
                <div className={CS.flex} style={{ height: topHeaderHeight }}>
                  {/* top left corner - displays left header columns */}
                  <PivotTableTopLeftCellsContainer
                    style={{
                      width: leftHeaderWidth,
                    }}
                  >
                    {rowIndexes.map((rowIndex: number, index: number) => {
                      const canCollapse =
                        index < rowIndexes.length - 1 &&
                        isColumnCollapsible(rowIndex);
                      return (
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
                            ...(canCollapse ? { cursor: "pointer" } : {}),
                          }}
                          onClick={
                            canCollapse
                              ? () =>
                                  toggleRow({
                                    value: index + 1,
                                    settings,
                                    updateSettings: applyCollapseSettings,
                                  })
                              : undefined
                          }
                        />
                      );
                    })}
                  </PivotTableTopLeftCellsContainer>
                  {/* top header */}
                  <Collection
                    aria-label="pivot-table-top-header"
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
                    onScroll={handleTopHeaderScroll}
                    scrollLeft={scrollLeft}
                  />
                </div>
                <div className={cx(CS.flex, CS.flexFull)}>
                  {/* left header */}
                  <div
                    style={{ width: leftHeaderWidth }}
                    onMouseLeave={() => setHoveredRowIndex(null)}
                  >
                    <AutoSizer disableWidth nonce={getCspNonce()}>
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
                                applyCollapseSettings
                              }
                              settings={settings}
                              getCellClickHandler={getCellClickHandler}
                              isNativeQuery={isNativePivotData(data.cols)}
                              hoveredRowIndex={hoveredRowIndex}
                              onRowHover={setHoveredRowIndex}
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
                          onScroll={handleLeftHeaderScroll}
                        />
                      )}
                    </AutoSizer>
                  </div>
                  {/* pivot table body */}
                  <div onMouseLeave={() => setHoveredRowIndex(null)}>
                    <AutoSizer disableWidth nonce={getCspNonce()}>
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
                                isRowHovered={hoveredRowIndex === rowIndex}
                                onRowHover={() => setHoveredRowIndex(rowIndex)}
                              />
                            );
                          }}
                          onScroll={handleGridScroll}
                          ref={gridRef}
                          elementRef={gridContainerRef}
                          scrollTop={scrollTop}
                          scrollLeft={scrollLeft}
                        />
                      )}
                    </AutoSizer>
                  </div>
                </div>
              </>
            )}
          </div>
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

const PivotViz: VisualizationDefinition = {
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
};

export const PivotTable = Object.assign(
  connect(mapStateToProps)(PivotTableView),
  PivotViz,
);

import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { HeaderGroup } from "@tanstack/table-core/src/types";
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import _ from "underscore";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";

import {
  DEFAULT_FONT_SIZE,
  PINNED_BORDER_SEPARATOR_WIDTH,
  ROW_ID_COLUMN_ID,
} from "../../constants";
import { DataGridThemeProvider } from "../../hooks";
import type {
  DataGridColumn,
  DataGridInstance,
  DataGridTheme,
  MaybeVirtualRow,
} from "../../types";
import { DataGridHeader } from "../DataGridHeader/DataGridHeader";
import { DataGridRow } from "../DataGridRow/DataGridRow";
import { Footer } from "../Footer/Footer";

import S from "./DataGrid.module.css";
import type { DataGridStylesProps } from "./types";

export interface DataGridProps<TData>
  extends DataGridInstance<TData>,
    DataGridStylesProps {
  emptyState?: React.ReactNode;
  showRowsCount?: boolean;
  rowsTruncated?: number;
  isColumnReorderingDisabled?: boolean;
  theme?: DataGridTheme;
  zoomedRowIndex?: number;
  tableFooterExtraButtons?: React.ReactNode;
}

export const DataGrid = function DataGrid<TData>({
  table,
  gridRef,
  virtualGrid,
  measureRoot,
  columnsReordering,
  selection,
  theme,
  classNames,
  styles,
  enablePagination,
  showRowsCount,
  getVisibleRows,
  getPinnedColumns,
  getCentralColumns,
  zoomedRowIndex,
  onBodyCellClick,
  tableFooterExtraButtons,
  rowsTruncated,
  sorting,
}: DataGridProps<TData>) {
  const { rowVirtualizer, columnVirtualizer } = virtualGrid;

  const dndContextProps = useMemo(
    () => ({
      collisionDetection: pointerWithin,
      modifiers: [restrictToHorizontalAxis],
      ...columnsReordering,
    }),
    [columnsReordering],
  );

  const rowMeasureRef = useCallback(
    (element: HTMLElement | null) => {
      rowVirtualizer.measureElement(element);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowVirtualizer, sorting],
  );

  const forceUpdate = useForceUpdate();
  useEffect(() => {
    const handleResize = _.debounce(forceUpdate, 100);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [forceUpdate]);

  // const isAddColumnButtonSticky =
  //   table.getTotalSize() >=
  //   (gridRef.current?.offsetWidth ?? Infinity) - ADD_COLUMN_BUTTON_WIDTH;

  /*
  const addColumnMarginRight =
    getTotalHeight() >= (gridRef.current?.offsetHeight ?? Infinity)
      ? getScrollBarSize()
      : 0;
*/

  // const hasAddColumnButton = onAddColumnClick != null;
  // const addColumnButton = useMemo(
  //   () =>
  //     hasAddColumnButton ? (
  //       <AddColumnButton
  //         marginRight={addColumnMarginRight}
  //         isSticky={isAddColumnButtonSticky}
  //         onClick={onAddColumnClick}
  //       />
  //     ) : null,
  //   [
  //     hasAddColumnButton,
  //     isAddColumnButtonSticky,
  //     onAddColumnClick,
  //     addColumnMarginRight,
  //   ],
  // );

  const rowsCount = table.getRowModel().rows.length;
  const backgroundColor =
    theme?.cell?.backgroundColor ?? "var(--mb-color-background-primary)";
  const stickyElementsBackgroundColor =
    theme?.stickyBackgroundColor ??
    (backgroundColor == null || backgroundColor === "transparent"
      ? "var(--mb-color-background-primary)"
      : backgroundColor);

  const pinnedColumns = table.getLeftVisibleLeafColumns();
  const hasPinnedColumns = pinnedColumns.length > 0;
  const lastPinnedColumn = pinnedColumns.at(-1);
  const isLastPinnedColumnRowId = lastPinnedColumn?.id === ROW_ID_COLUMN_ID;
  const hasSeparator = lastPinnedColumn != null && !isLastPinnedColumnRowId;

  const pinnedColumnsWidth = table.getLeftTotalSize();
  const pinnedPanelWidth = hasSeparator
    ? pinnedColumnsWidth + PINNED_BORDER_SEPARATOR_WIDTH
    : pinnedColumnsWidth;

  const totalHeight = rowVirtualizer.getTotalSize();

  const renderRow = (
    row: MaybeVirtualRow<TData>,
    columns: DataGridColumn<TData>[],
    key: string,
  ) => (
    <DataGridRow
      key={key}
      row={row}
      rowMeasureRef={rowMeasureRef}
      columns={columns}
      stickyElementsBackgroundColor={stickyElementsBackgroundColor}
      zoomedRowIndex={zoomedRowIndex}
      selection={selection}
      onBodyCellClick={onBodyCellClick}
      classNames={classNames}
      styles={styles}
    />
  );

  const renderHeader = (
    headerGroup: HeaderGroup<TData>,
    columns: DataGridColumn<TData>[],
  ) => <DataGridHeader headerGroup={headerGroup} columns={columns} />;

  return (
    <DataGridThemeProvider theme={theme}>
      <DndContext {...dndContextProps}>
        <div
          className={cx(S.table, classNames?.root)}
          data-testid="table-root"
          data-rows-count={rowsCount}
          style={{
            fontSize: theme?.fontSize ?? DEFAULT_FONT_SIZE,
            backgroundColor,
            ...styles?.root,
          }}
        >
          <div
            ref={gridRef}
            data-testid="table-scroll-container"
            className={cx(S.tableGrid, classNames?.tableGrid)}
            style={{
              backgroundColor,
              color: theme?.cell?.textColor,
              ...styles?.tableGrid,
            }}
          >
            <div
              data-testid="table-header"
              className={cx(S.headerContainer, classNames?.headerContainer)}
              style={{
                backgroundColor: stickyElementsBackgroundColor,
                ...styles?.headerContainer,
              }}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <SortableContext
                  key={headerGroup.id}
                  items={table.getState().columnOrder}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    className={cx(S.pinnedSection, {
                      [S.withSeparator]: hasSeparator,
                    })}
                    style={{
                      width: pinnedPanelWidth,
                      backgroundColor: stickyElementsBackgroundColor,
                    }}
                  >
                    {renderHeader(headerGroup, getPinnedColumns())}
                  </div>
                  <div
                    className={S.centralSection}
                    style={{
                      width: `${columnVirtualizer.getTotalSize()}px`,
                    }}
                  >
                    {renderHeader(headerGroup, getCentralColumns())}
                  </div>
                </SortableContext>
              ))}
            </div>

            <div
              data-testid="table-body"
              className={cx(S.bodyContainer, classNames?.bodyContainer, {
                [S.selectableBody]: selection.isEnabled,
              })}
              style={styles?.bodyContainer}
            >
              {hasPinnedColumns && (
                <div
                  className={cx(S.pinnedSection, {
                    [S.withSeparator]: hasSeparator,
                  })}
                  style={{
                    width: pinnedPanelWidth,
                    height: `${totalHeight}px`,
                    backgroundColor: stickyElementsBackgroundColor,
                  }}
                >
                  {getVisibleRows().map((row, index) =>
                    renderRow(row, getPinnedColumns(), `pinned-${index}`),
                  )}
                </div>
              )}
              <div
                className={S.centralSection}
                style={{
                  height: `${totalHeight}px`,
                  width: `${columnVirtualizer.getTotalSize()}px`,
                  backgroundColor,
                }}
              >
                {getVisibleRows().map((row, index) =>
                  renderRow(row, getCentralColumns(), `center-${index}`),
                )}
              </div>
            </div>
          </div>

          <Footer
            table={table}
            enablePagination={enablePagination}
            showRowsCount={showRowsCount}
            rowsTruncated={rowsTruncated}
            style={styles?.footer}
            className={classNames?.footer}
            tableFooterExtraButtons={tableFooterExtraButtons}
          />
        </div>
        {measureRoot}
      </DndContext>
    </DataGridThemeProvider>
  );
};

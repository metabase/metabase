import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { HeaderGroup } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect } from "react";
import _ from "underscore";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";

import {
  ADD_COLUMN_BUTTON_WIDTH,
  DEFAULT_FONT_SIZE,
  PINNED_BORDER_SEPARATOR_WIDTH,
} from "../../constants";
import { DataGridThemeProvider } from "../../hooks";
import { useDataGridColumnsReordering } from "../../hooks/use-data-grid-columns-reordering";
import type {
  DataGridColumn,
  DataGridInstance,
  DataGridTheme,
  MaybeVirtualRow,
} from "../../types";
import { AddColumnButton } from "../AddColumnButton/AddColumnButton";
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
  getPinnedRows,
  getCentralColumns,
  emptyState,
  zoomedRowIndex,
  onBodyCellClick,
  onWheel,
  tableFooterExtraButtons,
  rowsTruncated,
  sorting,
  onAddColumnClick,
  onHeaderCellClick,
  isColumnReorderingDisabled,
}: DataGridProps<TData>) {
  const {
    rowVirtualizer,
    columnVirtualizer,
    virtualPaddingLeft,
    virtualPaddingRight,
  } = virtualGrid;

  const rowMeasureRef = useCallback(
    (element: HTMLElement | null) => {
      rowVirtualizer.measureElement(element);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sorting` triggers re-measurement when sorting changes
    [rowVirtualizer, sorting],
  );

  const forceUpdate = useForceUpdate();
  useEffect(() => {
    const handleResize = _.debounce(forceUpdate, 100);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [forceUpdate]);

  const hasAddColumnButton = onAddColumnClick != null;
  const isAddColumnButtonSticky =
    hasAddColumnButton &&
    table.getTotalSize() >=
      (gridRef.current?.offsetWidth ?? Infinity) - ADD_COLUMN_BUTTON_WIDTH;

  const rowsCount = table.getRowModel().rows.length;
  const backgroundColor =
    theme?.cell?.backgroundColor ?? "var(--mb-color-background-primary)";
  const stickyElementsBackgroundColor =
    theme?.stickyBackgroundColor ??
    (backgroundColor == null || backgroundColor === "transparent"
      ? "var(--mb-color-background-primary)"
      : backgroundColor);

  const visibleRows = getVisibleRows();
  const pinnedRows = getPinnedRows();
  const pinnedColumns = getPinnedColumns();
  const centralColumns = getCentralColumns();
  const hasPinnedColumns = pinnedColumns.length > 0;
  const lastPinnedColumn = pinnedColumns.at(-1);
  const isLastPinnedColumnSpecial =
    lastPinnedColumn?.origin.columnDef.meta?.isUtilityColumn === true;
  const hasSeparator = lastPinnedColumn != null && !isLastPinnedColumnSpecial;

  const dndContextProps = useDataGridColumnsReordering(
    columnsReordering,
    pinnedColumns,
  );

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
      pinnedRowsCount={pinnedRows.length}
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
  ) => (
    <DataGridHeader
      headerGroup={headerGroup}
      columns={columns}
      onHeaderCellClick={onHeaderCellClick}
      isColumnReorderingDisabled={isColumnReorderingDisabled}
    />
  );

  const renderGridPanels = ({
    pinnedContent,
    centralContent,
    height,
  }: {
    pinnedContent: React.ReactNode;
    centralContent: React.ReactNode;
    height?: string;
  }) => (
    <>
      {hasPinnedColumns && (
        <div
          className={cx(S.pinnedSection, {
            [S.withSeparator]: hasSeparator,
          })}
          style={{
            width: pinnedPanelWidth,
            height,
            backgroundColor: stickyElementsBackgroundColor,
          }}
        >
          {pinnedContent}
        </div>
      )}
      <div
        className={S.centralSection}
        style={{
          height,
          width: `${columnVirtualizer.getTotalSize()}px`,
          backgroundColor,
          ...({
            "--virtual-padding-left": `${virtualPaddingLeft}px`,
            "--virtual-padding-right": `${virtualPaddingRight}px`,
          } as React.CSSProperties),
        }}
      >
        {centralContent}
      </div>
    </>
  );

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
            role="grid"
            style={{
              backgroundColor,
              color: theme?.cell?.textColor,
              paddingRight: isAddColumnButtonSticky
                ? ADD_COLUMN_BUTTON_WIDTH
                : undefined,
              ...styles?.tableGrid,
            }}
            onWheel={onWheel}
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
                  {renderGridPanels({
                    pinnedContent: renderHeader(headerGroup, pinnedColumns),
                    centralContent: renderHeader(headerGroup, centralColumns),
                  })}
                </SortableContext>
              ))}
              {hasAddColumnButton && !isAddColumnButtonSticky && (
                <AddColumnButton onClick={onAddColumnClick} />
              )}
            </div>

            {rowsCount === 0 && emptyState}

            <div
              data-testid="table-body"
              className={cx(S.bodyContainer, classNames?.bodyContainer, {
                [S.selectableBody]: selection.isEnabled,
              })}
              style={styles?.bodyContainer}
            >
              {renderGridPanels({
                pinnedContent: visibleRows.map((row, index) =>
                  renderRow(row, pinnedColumns, `pinned-${index}`),
                ),
                centralContent: visibleRows.map((row, index) =>
                  renderRow(row, centralColumns, `center-${index}`),
                ),
                height: `${totalHeight}px`,
              })}
            </div>
          </div>
          {isAddColumnButtonSticky && (
            <AddColumnButton isSticky onClick={onAddColumnClick} />
          )}

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

import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import _ from "underscore";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { getScrollBarSize } from "metabase/lib/dom";

import {
  ADD_COLUMN_BUTTON_WIDTH,
  DEFAULT_FONT_SIZE,
  ROW_ID_COLUMN_ID,
} from "../../constants";
import { DataGridThemeProvider } from "../../hooks";
import type { DataGridInstance, DataGridTheme } from "../../types";
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
  emptyState,
  theme,
  classNames,
  styles,
  enablePagination,
  showRowsCount,
  getTotalHeight,
  getVisibleRows,
  isColumnReorderingDisabled,
  zoomedRowIndex,
  onBodyCellClick,
  onHeaderCellClick,
  onAddColumnClick,
  onWheel,
  tableFooterExtraButtons,
  rowsTruncated,
  sorting,
}: DataGridProps<TData>) {
  const {
    virtualColumns,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
  } = virtualGrid;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sorting` triggers re-measurement when sorting changes
    [rowVirtualizer, sorting],
  );

  const forceUpdate = useForceUpdate();
  useEffect(() => {
    const handleResize = _.debounce(forceUpdate, 100);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [forceUpdate]);

  const isAddColumnButtonSticky =
    table.getTotalSize() >=
    (gridRef.current?.offsetWidth ?? Infinity) - ADD_COLUMN_BUTTON_WIDTH;

  const addColumnMarginRight =
    getTotalHeight() >= (gridRef.current?.offsetHeight ?? Infinity)
      ? getScrollBarSize()
      : 0;

  const hasAddColumnButton = onAddColumnClick != null;
  const addColumnButton = useMemo(
    () =>
      hasAddColumnButton ? (
        <AddColumnButton
          marginRight={addColumnMarginRight}
          isSticky={isAddColumnButtonSticky}
          onClick={onAddColumnClick}
        />
      ) : null,
    [
      hasAddColumnButton,
      isAddColumnButtonSticky,
      onAddColumnClick,
      addColumnMarginRight,
    ],
  );

  const rowsCount = table.getRowModel().rows.length;
  const backgroundColor =
    theme?.cell?.backgroundColor ?? "var(--mb-color-background-primary)";
  const stickyElementsBackgroundColor =
    theme?.stickyBackgroundColor ??
    (backgroundColor == null || backgroundColor === "transparent"
      ? "var(--mb-color-background-primary)"
      : backgroundColor);

  const lastPinnedColumn = table.getLeftVisibleLeafColumns().at(-1);
  const isLastPinnedColumnRowId = lastPinnedColumn?.id === ROW_ID_COLUMN_ID;
  const lastTopPinnedRowId = table.getTopRows().at(-1)?.id;

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
            data-testid="table-scroll-container"
            className={cx(S.tableGrid, classNames?.tableGrid)}
            role="grid"
            ref={gridRef}
            style={{
              paddingRight:
                hasAddColumnButton && isAddColumnButtonSticky
                  ? `${ADD_COLUMN_BUTTON_WIDTH}px`
                  : 0,
              ...styles?.tableGrid,
            }}
            onWheel={onWheel}
          >
            <DataGridHeader
              table={table}
              virtualColumns={virtualColumns}
              virtualPaddingLeft={virtualPaddingLeft}
              virtualPaddingRight={virtualPaddingRight}
              lastPinnedColumn={lastPinnedColumn}
              isLastPinnedColumnRowId={isLastPinnedColumnRowId}
              stickyElementsBackgroundColor={stickyElementsBackgroundColor}
              backgroundColor={backgroundColor}
              isAddColumnButtonSticky={isAddColumnButtonSticky}
              addColumnButton={addColumnButton}
              isColumnReorderingDisabled={isColumnReorderingDisabled}
              onHeaderCellClick={onHeaderCellClick}
              classNames={classNames}
              styles={styles}
            />

            {rowsCount === 0 && emptyState}

            <div
              data-testid="table-body"
              className={cx(S.bodyContainer, classNames?.bodyContainer, {
                [S.selectableBody]: selection.isEnabled,
              })}
              style={{
                display: "grid",
                alignContent: "start",
                position: "relative",
                height: `${getTotalHeight()}px`,
                backgroundColor: theme?.cell?.backgroundColor,
                color: theme?.cell?.textColor,
                ...styles?.bodyContainer,
              }}
            >
              {getVisibleRows().map((maybeVirtualRow, index) => (
                <DataGridRow
                  key={index}
                  maybeVirtualRow={maybeVirtualRow}
                  rowMeasureRef={rowMeasureRef}
                  virtualColumns={virtualColumns}
                  virtualPaddingLeft={virtualPaddingLeft}
                  virtualPaddingRight={virtualPaddingRight}
                  lastPinnedColumn={lastPinnedColumn}
                  isLastPinnedColumnRowId={isLastPinnedColumnRowId}
                  lastTopPinnedRowId={lastTopPinnedRowId}
                  stickyElementsBackgroundColor={stickyElementsBackgroundColor}
                  zoomedRowIndex={zoomedRowIndex}
                  selection={selection}
                  onBodyCellClick={onBodyCellClick}
                  classNames={classNames}
                  styles={styles}
                />
              ))}
            </div>
          </div>
          {isAddColumnButtonSticky ? addColumnButton : null}
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

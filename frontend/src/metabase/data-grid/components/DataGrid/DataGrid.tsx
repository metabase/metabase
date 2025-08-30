import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { flexRender } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import _ from "underscore";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { hasModifierKeys } from "metabase/common/utils/keyboard";
import { AddColumnButton } from "metabase/data-grid/components/AddColumnButton/AddColumnButton";
import { SortableHeader } from "metabase/data-grid/components/SortableHeader/SortableHeader";
import {
  ADD_COLUMN_BUTTON_WIDTH,
  DEFAULT_FONT_SIZE,
  HEADER_HEIGHT,
  PINNED_COLUMN_Z_INDEX,
} from "metabase/data-grid/constants";
import { isVirtualRow } from "metabase/data-grid/guards";
import { DataGridThemeProvider } from "metabase/data-grid/hooks/use-table-theme";
import type { DataGridInstance, DataGridTheme } from "metabase/data-grid/types";
import { getScrollBarSize } from "metabase/lib/dom";

import { Footer } from "../Footer/Footer";

import S from "./DataGrid.module.css";

// Component supports Mantine-like Styles API
// Technically this is not the 1:1 mapping of the Mantine API, but it's close enough
// https://mantine.dev/styles/styles-api/
export type DataGridStylesNames =
  | "root"
  | "tableGrid"
  | "row"
  | "headerContainer"
  | "headerCell"
  | "bodyContainer"
  | "bodyCell"
  | "footer";

export type DataGridStylesProps = {
  classNames?: { [key in DataGridStylesNames]?: string };
  styles?: { [key in DataGridStylesNames]?: React.CSSProperties };
};

export interface DataGridProps<TData>
  extends DataGridInstance<TData>,
    DataGridStylesProps {
  emptyState?: React.ReactNode;
  showRowsCount?: boolean;
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
    [rowVirtualizer],
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
    theme?.cell?.backgroundColor ?? "var(--mb-color-background)";
  const stickyElementsBackgroundColor =
    theme?.stickyBackgroundColor ??
    (backgroundColor == null || backgroundColor === "transparent"
      ? "var(--mb-color-background)"
      : backgroundColor);

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
            <div
              data-testid="table-header"
              className={cx(S.headerContainer, classNames?.headerContainer)}
              style={{
                backgroundColor: stickyElementsBackgroundColor,
                ...styles?.headerContainer,
              }}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <div
                  key={headerGroup.id}
                  className={cx(S.row, classNames?.row)}
                  style={{
                    height: `${HEADER_HEIGHT}px`,
                    backgroundColor,
                    ...styles?.row,
                  }}
                >
                  {virtualPaddingLeft ? (
                    <div style={{ width: virtualPaddingLeft }} />
                  ) : null}
                  <SortableContext
                    items={table.getState().columnOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    {virtualColumns.map((virtualColumn) => {
                      const header = headerGroup.headers[virtualColumn.index];
                      const headerCell = flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      );
                      const width = header.column.getSize();
                      const isPinned = header.column.getIsPinned();
                      const style: React.CSSProperties = isPinned
                        ? {
                            width,
                            position: "sticky",
                            left: `${virtualColumn.start}px`,
                            zIndex: PINNED_COLUMN_Z_INDEX,
                            backgroundColor: stickyElementsBackgroundColor,
                          }
                        : {
                            width,
                          };

                      const headerContent = isPinned ? (
                        headerCell
                      ) : (
                        <SortableHeader
                          className={cx(S.headerCell, classNames?.headerCell)}
                          style={{
                            backgroundColor: stickyElementsBackgroundColor,
                            ...styles?.headerCell,
                          }}
                          isColumnReorderingDisabled={
                            isColumnReorderingDisabled
                          }
                          header={header}
                          onClick={onHeaderCellClick}
                        >
                          {headerCell}
                        </SortableHeader>
                      );

                      return (
                        <div key={header.id} style={style}>
                          {headerContent}
                        </div>
                      );
                    })}
                  </SortableContext>
                  {!isAddColumnButtonSticky ? addColumnButton : null}
                  {virtualPaddingRight ? (
                    <div style={{ width: virtualPaddingRight }} />
                  ) : null}
                </div>
              ))}
            </div>

            {rowsCount === 0 && emptyState}

            <div
              data-testid="table-body"
              className={cx(S.bodyContainer, classNames?.bodyContainer, {
                [S.selectableBody]: selection.isEnabled,
              })}
              style={{
                display: "grid",
                position: "relative",
                height: `${getTotalHeight()}px`,
                backgroundColor: theme?.cell?.backgroundColor,
                color: theme?.cell?.textColor,
                ...styles?.bodyContainer,
              }}
            >
              {getVisibleRows().map((maybeVirtualRow) => {
                const { row, virtualRow } = isVirtualRow(maybeVirtualRow)
                  ? maybeVirtualRow
                  : { row: maybeVirtualRow, virtualRow: undefined };

                const virtualRowStyles: React.CSSProperties =
                  virtualRow != null
                    ? {
                        position: "absolute",
                        minHeight: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }
                    : {};

                const dataIndex =
                  virtualRow != null ? virtualRow.index : row.index;
                const active = zoomedRowIndex === dataIndex;

                return (
                  <div
                    role="row"
                    key={row.id}
                    ref={rowMeasureRef}
                    data-dataset-index={row.index}
                    data-index={dataIndex}
                    data-allow-page-break-after="true"
                    data-row-selected={row.getIsSelected()}
                    className={cx(S.row, classNames?.row, {
                      [S.active]: active,
                    })}
                    style={{
                      ...virtualRowStyles,
                      ...styles?.row,
                    }}
                  >
                    {virtualPaddingLeft ? (
                      <div
                        className={cx(S.bodyCell, classNames?.bodyCell)}
                        style={{
                          width: virtualPaddingLeft,
                          ...styles?.bodyCell,
                        }}
                      />
                    ) : null}

                    {virtualColumns.map((virtualColumn) => {
                      const cell = row.getVisibleCells()[virtualColumn.index];
                      const isPinned = cell.column.getIsPinned();
                      const width = cell.column.getSize();
                      const columnDef = cell.column.columnDef;
                      const isSelectable =
                        selection.isEnabled && columnDef?.meta?.enableSelection;

                      const style: React.CSSProperties = isPinned
                        ? {
                            width,
                            position: "sticky",
                            left: `${virtualColumn.start}px`,
                            zIndex: PINNED_COLUMN_Z_INDEX,
                            backgroundColor: active
                              ? undefined
                              : stickyElementsBackgroundColor,
                            ...styles?.bodyCell,
                          }
                        : {
                            width,
                            ...styles?.bodyCell,
                          };
                      return (
                        <div
                          key={cell.id}
                          aria-selected={selection.isCellSelected(cell)}
                          data-column-id={cell.column.id}
                          data-selectable-cell={isSelectable ? "" : undefined}
                          className={cx(S.bodyCell, classNames?.bodyCell, {
                            [S.focusedCell]: selection.isCellFocused(cell),
                          })}
                          onClick={(e) => {
                            if (hasModifierKeys(e)) {
                              return;
                            }
                            onBodyCellClick?.(
                              e,
                              cell.row.index,
                              cell.column.id,
                            );
                          }}
                          onDoubleClick={() =>
                            selection.handlers.handleCellDoubleClick(cell)
                          }
                          onMouseDown={(e) =>
                            selection.handlers.handleCellMouseDown(e, cell)
                          }
                          onMouseUp={(e) =>
                            selection.handlers.handleCellMouseUp(e, cell)
                          }
                          onMouseOver={(e) =>
                            selection.handlers.handleCellMouseOver(e, cell)
                          }
                          style={style}
                        >
                          {flexRender(cell.column.columnDef.cell, {
                            ...cell.getContext(),
                            isSelected: selection.isCellSelected(cell),
                          })}
                        </div>
                      );
                    })}
                    {virtualPaddingRight ? (
                      <div
                        className={cx(S.bodyCell, classNames?.bodyCell)}
                        style={{
                          width: virtualPaddingRight,
                          ...styles?.bodyCell,
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {isAddColumnButtonSticky ? addColumnButton : null}
          <Footer
            table={table}
            enablePagination={enablePagination}
            showRowsCount={showRowsCount}
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

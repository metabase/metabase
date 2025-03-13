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

import { AddColumnButton } from "metabase/data-grid/components/AddColumnButton/AddColumnButton";
import { SortableHeader } from "metabase/data-grid/components/SortableHeader/SortableHeader";
import {
  ADD_COLUMN_BUTTON_WIDTH,
  DEFAULT_FONT_SIZE,
  HEADER_HEIGHT,
  PINNED_COLUMN_Z_INDEX,
} from "metabase/data-grid/constants";
import { DataGridThemeProvider } from "metabase/data-grid/hooks/use-table-theme";
import type { DataGridInstance, DataGridTheme } from "metabase/data-grid/types";
import { useForceUpdate } from "metabase/hooks/use-force-update";
import { getScrollBarSize } from "metabase/lib/dom";

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
  | "bodyCell";

export type DataGridStylesProps = {
  classNames?: { [key in DataGridStylesNames]?: string };
  styles?: { [key in DataGridStylesNames]?: React.CSSProperties };
};

export interface DataGridProps<TData>
  extends DataGridInstance<TData>,
    DataGridStylesProps {
  emptyState?: React.ReactNode;
  theme?: DataGridTheme;
}

export const DataGrid = function DataGrid<TData>({
  table,
  gridRef,
  virtualGrid,
  measureRoot,
  columnsReordering,
  emptyState,
  theme,
  classNames,
  styles,
  onBodyCellClick,
  onHeaderCellClick,
  onAddColumnClick,
  onScroll,
}: DataGridProps<TData>) {
  const {
    virtualColumns,
    virtualRows,
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
    virtualGrid.rowVirtualizer.getTotalSize() >=
    (gridRef.current?.offsetHeight ?? Infinity)
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

  const isEmpty = table.getRowModel().rows.length === 0;

  const backgroundColor =
    theme?.cell?.backgroundColor ?? "var(--mb-color-bg-white)";

  return (
    <DataGridThemeProvider theme={theme}>
      <DndContext {...dndContextProps}>
        <div
          className={cx(S.table, classNames?.root)}
          data-testid="table-root"
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
              paddingRight: isAddColumnButtonSticky
                ? `${ADD_COLUMN_BUTTON_WIDTH}px`
                : 0,
              ...styles?.tableGrid,
            }}
            onScroll={onScroll}
          >
            <div
              data-testid="table-header"
              className={cx(S.headerContainer, classNames?.headerContainer)}
              style={styles?.headerContainer}
            >
              {table.getHeaderGroups().map(headerGroup => (
                <div
                  key={headerGroup.id}
                  className={cx(S.row, classNames?.row)}
                  style={{ height: `${HEADER_HEIGHT}px`, ...styles?.row }}
                >
                  {virtualPaddingLeft ? (
                    <div style={{ width: virtualPaddingLeft }} />
                  ) : null}
                  <SortableContext
                    items={table.getState().columnOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    {virtualColumns.map(virtualColumn => {
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
                            backgroundColor,
                          }
                        : {
                            width,
                          };

                      const headerContent = isPinned ? (
                        headerCell
                      ) : (
                        <SortableHeader
                          className={cx(S.headerCell, classNames?.headerCell)}
                          style={styles?.headerCell}
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

            {isEmpty && emptyState}

            <div
              data-testid="table-body"
              className={cx(S.bodyContainer, classNames?.bodyContainer)}
              style={{
                display: "grid",
                position: "relative",
                height: `${rowVirtualizer.getTotalSize()}px`,
                backgroundColor: theme?.cell?.backgroundColor,
                color: theme?.cell?.textColor,
                ...styles?.bodyContainer,
              }}
            >
              {virtualRows.map(virtualRow => {
                const row = table.getRowModel().rows[virtualRow.index];
                return (
                  <div
                    role="row"
                    key={row.id}
                    ref={rowMeasureRef}
                    data-index={virtualRow.index}
                    className={cx(S.row, classNames?.row)}
                    style={{
                      position: "absolute",
                      width: "100%",
                      minHeight: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
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

                    {virtualColumns.map(virtualColumn => {
                      const cell = row.getVisibleCells()[virtualColumn.index];
                      const isPinned = cell.column.getIsPinned();
                      const width = cell.column.getSize();

                      const style: React.CSSProperties = isPinned
                        ? {
                            width,
                            position: "sticky",
                            left: `${virtualColumn.start}px`,
                            zIndex: PINNED_COLUMN_Z_INDEX,
                            backgroundColor,
                            ...styles?.bodyCell,
                          }
                        : {
                            width,
                            ...styles?.bodyCell,
                          };
                      return (
                        <div
                          key={cell.id}
                          className={cx(S.bodyCell, classNames?.bodyCell)}
                          onClick={e =>
                            onBodyCellClick?.(e, cell.row.index, cell.column.id)
                          }
                          style={style}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
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
        </div>
        {measureRoot}
      </DndContext>
    </DataGridThemeProvider>
  );
};

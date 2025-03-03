import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { flexRender } from "@tanstack/react-table";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import _ from "underscore";

import { AddColumnButton } from "metabase/data-grid/components/AddColumnButton/AddColumnButton";
import { SortableHeader } from "metabase/data-grid/components/SortableHeader/SortableHeader";
import {
  ADD_COLUMN_BUTTON_WIDTH,
  HEADER_HEIGHT,
  PINNED_COLUMN_Z_INDEX,
} from "metabase/data-grid/constants";
import type { DataGridInstance } from "metabase/data-grid/types";
import { useForceUpdate } from "metabase/hooks/use-force-update";

import S from "./DataGrid.module.css";

export type DataGridProps<TData> = DataGridInstance<TData> & {
  emptyState?: React.ReactNode;
};

export const DataGrid = function DataGrid<TData>({
  table,
  gridRef,
  virtualGrid,
  measureRoot,
  columnsReordering,
  emptyState,
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

  const hasAddColumnButton = onAddColumnClick != null;
  const addColumnButton = useMemo(
    () =>
      hasAddColumnButton ? (
        <AddColumnButton
          isSticky={isAddColumnButtonSticky}
          onClick={onAddColumnClick}
        />
      ) : null,
    [hasAddColumnButton, isAddColumnButtonSticky, onAddColumnClick],
  );

  const isEmpty = table.getRowModel().rows.length === 0;

  return (
    <DndContext {...dndContextProps}>
      <div className={S.table} data-testid="table-root">
        <div
          data-testid="table-scroll-container"
          className={S.tableGrid}
          role="grid"
          ref={gridRef}
          style={{
            paddingRight: isAddColumnButtonSticky
              ? `${ADD_COLUMN_BUTTON_WIDTH}px`
              : 0,
          }}
          onScroll={onScroll}
        >
          <div data-testid="table-header" className={S.headerContainer}>
            {table.getHeaderGroups().map(headerGroup => (
              <div
                key={headerGroup.id}
                className={S.row}
                style={{ height: `${HEADER_HEIGHT}px` }}
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
                        }
                      : {
                          width,
                        };

                    const headerContent = isPinned ? (
                      headerCell
                    ) : (
                      <SortableHeader
                        className={S.headerCell}
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
            className={S.bodyContainer}
            style={{
              display: "grid",
              position: "relative",
              height: `${rowVirtualizer.getTotalSize()}px`,
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
                  className={S.row}
                  style={{
                    position: "absolute",
                    width: "100%",
                    minHeight: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {virtualPaddingLeft ? (
                    <div
                      className={S.bodyCell}
                      style={{ width: virtualPaddingLeft }}
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
                        }
                      : {
                          width,
                        };
                    return (
                      <div
                        key={cell.id}
                        className={S.bodyCell}
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
                      className={S.bodyCell}
                      style={{ width: virtualPaddingRight }}
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
  );
};

import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { flexRender } from "@tanstack/react-table";
import { type Ref, forwardRef, useCallback, useMemo } from "react";

import { AddColumnButton } from "metabase/data-grid/components/AddColumnButton";
import { SortableHeader } from "metabase/data-grid/components/SortableHeader";
import { HEADER_HEIGHT } from "metabase/data-grid/constants";
import type { DataGridInstance } from "metabase/data-grid/types";

import S from "./DataGrid.module.css";

export type DataGridProps<TData> = DataGridInstance<TData>;

export const DataGrid = forwardRef(function DataGrid<TData>(
  {
    table,
    refs,
    virtualGrid,
    measureRoot,
    columnsReordering,
    onBodyCellClick,
    onHeaderCellClick,
    onAddColumnClick,
    onScroll,
  }: DataGridProps<TData>,
  ref: Ref<HTMLDivElement>,
) {
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

  const isAddColumnButtonSticky =
    table.getTotalSize() >= (refs.gridRef.current?.offsetWidth ?? Infinity);
  const hasAddColumnButton = onAddColumnClick != null;
  const addColumnButton = useMemo(
    () =>
      hasAddColumnButton ? (
        <AddColumnButton
          isOverflowing={isAddColumnButtonSticky}
          onClick={onAddColumnClick}
        />
      ) : null,
    [hasAddColumnButton, isAddColumnButtonSticky, onAddColumnClick],
  );

  return (
    <DndContext {...dndContextProps}>
      <div ref={ref} className={S.table} data-testid="table-root">
        <div
          data-testid="table-scroll-container"
          className={S.tableGrid}
          ref={refs.gridRef}
          style={{
            paddingRight: isAddColumnButtonSticky ? "36px" : 0,
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

                    return (
                      <div
                        key={header.id}
                        style={{
                          width: header.getSize(),
                          position: "relative",
                        }}
                      >
                        <SortableHeader
                          className={S.headerCell}
                          header={header}
                          onClick={onHeaderCellClick}
                        >
                          {headerCell}
                        </SortableHeader>
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
                    return (
                      <div
                        key={cell.id}
                        className={S.bodyCell}
                        onClick={e =>
                          onBodyCellClick?.(e, cell.row.index, cell.column.id)
                        }
                        style={{
                          position: "relative",
                          width: cell.column.getSize(),
                        }}
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
});

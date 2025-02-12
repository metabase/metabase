import { DndContext, pointerWithin } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { flexRender } from "@tanstack/react-table";
import { type RefObject, useCallback, useMemo } from "react";

import { AddColumnButton } from "metabase/visualizations/components/Table/AddColumnButton";

import { SortableHeader } from "./SortableHeader";
import S from "./Table.module.css";
import { HEADER_HEIGHT } from "./constants";
import type { TableInstance } from "./hooks/use-table-instance";

export interface TableRefs {
  bodyRef: RefObject<HTMLDivElement>;
}

export type TableProps<TData> = TableInstance<TData> & {
  width: number;
  height: number;
};

export const Table = <TData,>({
  table,
  refs,
  virtualGrid,
  measureRoot,
  columnsReordering,
  width,
  height,
  renderHeaderDecorator,
  onBodyCellClick,
  onHeaderCellClick,
  onAddColumnClick,
}: TableProps<TData>) => {
  const {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
  } = virtualGrid;

  const isResizing = Boolean(
    table.getState().columnSizingInfo.isResizingColumn,
  );

  const rowMeasureRef = useCallback(
    (element: HTMLElement | null) => {
      rowVirtualizer.measureElement(element);
    },
    [rowVirtualizer],
  );

  const isAddColumnButtonSticky = table.getTotalSize() >= width;
  const hasAddColumnButton = onAddColumnClick != null;
  const addColumnButton = useMemo(
    () =>
      hasAddColumnButton ? (
        <AddColumnButton
          headerHeight={HEADER_HEIGHT}
          isOverflowing={isAddColumnButtonSticky}
          onClick={onAddColumnClick}
        />
      ) : null,
    [hasAddColumnButton, isAddColumnButtonSticky, onAddColumnClick],
  );

  return (
    <DndContext
      sensors={columnsReordering.sensors}
      collisionDetection={pointerWithin}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={columnsReordering.onDragStart}
      onDragOver={columnsReordering.onDragOver}
      onDragEnd={columnsReordering.onDragEnd}
    >
      <div style={{ height, width }} className={S.table} tabIndex={-1}>
        <div
          ref={refs.bodyRef}
          style={{
            height: `${height}px`,
            width: `${width}px`,
            overflow: "auto",
            position: "relative",
          }}
        >
          <div className={S.tableGrid}>
            <div className={S.headerContainer}>
              {table.getHeaderGroups().map(headerGroup => (
                <div key={headerGroup.id} className={S.row}>
                  {virtualPaddingLeft ? (
                    <div
                      className={S.bodyCell}
                      style={{ width: virtualPaddingLeft }}
                    />
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
                            header={header}
                            renderHeaderDecorator={renderHeaderDecorator}
                            onClick={onHeaderCellClick}
                            isResizing={isResizing}
                          >
                            {headerCell}
                          </SortableHeader>
                        </div>
                      );
                    })}
                  </SortableContext>
                  {!isAddColumnButtonSticky ? addColumnButton : null}
                  {virtualPaddingRight ? (
                    <div
                      className={S.bodyCell}
                      style={{ width: virtualPaddingRight }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div
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
        </div>
        {isAddColumnButtonSticky ? addColumnButton : null}
      </div>
      {measureRoot}
    </DndContext>
  );
};

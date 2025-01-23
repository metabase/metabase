import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useRef, useState } from "react";

import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import styles from "./Table.module.css";
import { useTableCellsMeasure } from "./hooks/use-cell-measure";
import { useColumnResizeObserver } from "./hooks/use-column-resize-observer";
import { useColumns } from "./hooks/use-columns";
import { useVirtualGrid } from "./hooks/use-virtual-grid";

interface TableProps extends VisualizationProps {
  onZoomRow?: (objectId: number | string) => void;
  rowIndexToPkMap?: Record<number, string>;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  isPivoted?: boolean;
  hasMetadataPopovers?: boolean;
  question: Question;
}

export const _Table = ({
  data,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
  isPivoted = false,
  getColumnSortDirection,
  question,
  hasMetadataPopovers = true,
}: TableProps) => {
  const { rows, cols } = data;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    cols.map((_col, index) => index.toString()),
  );

  const {
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    measureRoot,
  } = useTableCellsMeasure();

  const { columns, columnFormatters, onResizeColumn } = useColumns({
    settings,
    onVisualizationClick,
    data,
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    isPivoted,
    getColumnSortDirection,
    question,
    hasMetadataPopovers,
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnOrder,
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onEnd",
    onColumnOrderChange: setColumnOrder,
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    if (bodyRef.current) {
      bodyRef.current.style.overflow = "hidden";
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      // Only update UI state for visual feedback during drag
      setColumnOrder(columnOrder => {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        return arrayMove(columnOrder, oldIndex, newIndex);
      });
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (bodyRef.current) {
        bodyRef.current.style.overflow = "auto";
      }

      if (isPivoted) {
        return;
      }

      const { active, over } = event;
      if (active && over && active.id !== over.id) {
        const oldIndex = parseInt(active.id as string, 10);
        const newIndex = parseInt(over.id as string, 10);

        const columns =
          settings["table.columns"]?.slice() ||
          cols.map((col, index) => ({
            name: col.name,
            enabled: true,
            index,
          }));

        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);

        onUpdateVisualizationSettings({
          "table.columns": columns,
        });
      }
    },
    [settings, onUpdateVisualizationSettings, isPivoted, cols],
  );

  const {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
    measureGrid,
  } = useVirtualGrid({
    bodyRef,
    table,
    data,
    columns,
    columnFormatters,
    measureBodyCellDimensions,
  });

  const handleColumnResize = useCallback(
    (columnId: string, width: number) => {
      const columnIndex = parseInt(columnId);
      const newColumnWidths = onResizeColumn(columnIndex, width);

      onUpdateVisualizationSettings({
        "table.column_widths": newColumnWidths,
      });

      measureGrid();
    },
    [measureGrid, onResizeColumn, onUpdateVisualizationSettings],
  );

  useColumnResizeObserver(table.getState(), handleColumnResize);

  const measureRef = useCallback(
    (element: HTMLElement | null) => {
      rowVirtualizer.measureElement(element);
    },
    [rowVirtualizer],
  );

  if (width == null || height == null) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <>
        <div style={{ height, width }} className={styles.table}>
          <div
            ref={bodyRef}
            style={{
              height: `${height}px`,
              width: `${width}px`,
              overflow: "auto",
              position: "relative",
            }}
          >
            <div className={styles.tableGrid}>
              <div className={styles.thead}>
                {table.getHeaderGroups().map(headerGroup => (
                  <div key={headerGroup.id} className={styles.tr}>
                    {virtualPaddingLeft ? (
                      <div
                        className={styles.th}
                        style={{ width: virtualPaddingLeft }}
                      />
                    ) : null}
                    <SortableContext
                      items={columnOrder}
                      strategy={horizontalListSortingStrategy}
                    >
                      {virtualColumns.map(virtualColumn => {
                        const header = headerGroup.headers[virtualColumn.index];
                        const headerContent = flexRender(
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
                            {headerContent}
                          </div>
                        );
                      })}
                    </SortableContext>
                    {virtualPaddingRight ? (
                      <div
                        className={styles.th}
                        style={{ width: virtualPaddingRight }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
              <div
                className={styles.tbody}
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
                      ref={measureRef}
                      data-index={virtualRow.index}
                      className={styles.tr}
                      style={{
                        position: "absolute",
                        width: "100%",
                        minHeight: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {virtualPaddingLeft ? (
                        <div
                          className={styles.td}
                          style={{ width: virtualPaddingLeft }}
                        />
                      ) : null}

                      {virtualColumns.map(virtualColumn => {
                        const cell = row.getVisibleCells()[virtualColumn.index];
                        return (
                          <div
                            key={cell.id}
                            className={styles.td}
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
                          className={styles.td}
                          style={{ width: virtualPaddingRight }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {measureRoot}
      </>
    </DndContext>
  );
};

interface StateProps {
  queryBuilderMode: string;
  isEmbeddingSdk: boolean;
  scrollToLastColumn: boolean;
  isRawTable: boolean;
}

const mapStateToProps = (state: any): StateProps => ({
  queryBuilderMode: getQueryBuilderMode(state),
  isEmbeddingSdk: getIsEmbeddingSdk(state),
  scrollToLastColumn: getUiControls(state).scrollToLastColumn,
  isRawTable: getIsShowingRawTable(state),
});

export const Table = connect(mapStateToProps, null)(_Table);

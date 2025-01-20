import {
  DndContext,
  type DragEndEvent,
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Header,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { type CSSProperties, useCallback, useRef, useState } from "react";

import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { OrderByDirection } from "metabase-lib/types";
import type { RowValues, VisualizationSettings } from "metabase-types/api";

import styles from "./Table.module.css";
import { MIN_COLUMN_WIDTH } from "./constants";
import { useTableCellsMeasure } from "./hooks/use-cell-measure";
import { useColumns } from "./hooks/use-columns";
import { useVirtualGrid } from "./hooks/use-virtual-grid";

interface TableProps extends VisualizationProps {
  onZoomRow?: (objectId: number | string) => void;
  rowIndexToPkMap?: Record<number, string>;
  getColumnSortDirection: (columnIndex: number) => OrderByDirection | undefined;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  isPivoted?: boolean;
}

interface DraggableHeaderProps {
  header: Header<RowValues, unknown>;
  onResize: (width: number) => void;
  isPivoted?: boolean;
}

const DraggableHeader = ({
  header,
  onResize,
  isPivoted,
}: DraggableHeaderProps) => {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: header.id,
      disabled: isPivoted,
    });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    transition: "width transform 0.2s ease-in-out",
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    zIndex: isDragging ? 2 : 0,
    cursor: isPivoted ? "default" : "grab",
    outline: "none",
  };

  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.pageX;
    const startWidth = header.column.getSize();
    setIsResizing(true);

    const handleMouseMove = (e: MouseEvent) => {
      const width = Math.max(MIN_COLUMN_WIDTH, startWidth + (e.pageX - startX));
      onResize(width);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const dndProps = !isResizing
    ? {
        ...attributes,
        ...listeners,
        onMouseDown: (e: React.MouseEvent) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            listeners?.onMouseDown?.(e);
          }
        },
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      className={styles.th}
      style={style}
      {...dndProps}
      tabIndex={-1}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <div className={styles.resizer} onMouseDown={handleResizeStart} />
    </div>
  );
};

export const _Table = ({
  data,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
  isPivoted = false,
  getColumnSortDirection,
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

  const { columns, columnFormatters, columnWidths } = useColumns({
    settings,
    onVisualizationClick,
    data,
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    isPivoted,
    getColumnSortDirection,
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnOrder,
    },
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onEnd",
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const handleDragStart = useCallback(() => {
    if (bodyRef.current) {
      bodyRef.current.style.overflow = "hidden";
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

        const columns = settings["table.columns"]?.slice() || [];
        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);

        const settingsUpdate: Partial<VisualizationSettings> = {
          "table.columns": columns,
        };

        const widths = settings["table.column_widths"];
        if (Array.isArray(widths) && widths.length > 0) {
          const newWidths = widths.slice();
          newWidths.splice(newIndex, 0, newWidths.splice(oldIndex, 1)[0]);
          settingsUpdate["table.column_widths"] = newWidths;
        }
        onUpdateVisualizationSettings(settingsUpdate);

        setColumnOrder(columnOrder => {
          const oldIndex = columnOrder.indexOf(active.id as string);
          const newIndex = columnOrder.indexOf(over.id as string);
          return arrayMove(columnOrder, oldIndex, newIndex);
        });
      }
    },
    [settings, onUpdateVisualizationSettings, isPivoted],
  );

  const {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
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
      const dataIndex = parseInt(columnId, 10);
      if (isNaN(dataIndex)) {
        return;
      }

      const newColumnWidths = [...columnWidths];
      newColumnWidths[dataIndex] = Math.max(MIN_COLUMN_WIDTH, width);

      onUpdateVisualizationSettings({
        "table.column_widths": newColumnWidths,
      });

      const column = columns.find(column => column.id === columnId);
      if (column?.meta?.wrap) {
        rowVirtualizer.measure();
      }
    },
    [columnWidths, onUpdateVisualizationSettings, rowVirtualizer, columns],
  );

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
                        return (
                          <DraggableHeader
                            key={header.id}
                            header={header}
                            onResize={width =>
                              handleColumnResize(header.id, width)
                            }
                            isPivoted={isPivoted}
                          />
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
                        height: `${virtualRow.size}px`,
                        position: "absolute",
                        transform: `translateY(${virtualRow.start}px)`,
                        width: "100%",
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

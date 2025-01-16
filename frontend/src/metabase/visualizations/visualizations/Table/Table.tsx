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
  type Cell,
  type Header,
  type Table as ReactTable,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type CSSProperties,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  DatasetData,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import styles from "./Table.module.css";
import { useTableCellsMeasure } from "./hooks/use-cell-measure";
import { useColumns } from "./hooks/use-columns";

const ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 60;

interface TableProps extends VisualizationProps {
  onZoomRow?: (objectId: number | string) => void;
  rowIndexToPkMap?: Record<number, string>;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
}

interface DraggableHeaderProps {
  header: Header<RowValues, unknown>;
  onResize: (width: number) => void;
}

interface DraggableCellProps {
  cell: Cell<RowValues, unknown>;
}

interface UseVirtualGridProps {
  bodyRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<RowValues>;
  data: DatasetData;
  columnFormatters: ((value: RowValue) => any)[];
  measureBodyCellDimensions: (value: any, width: number) => { height: number };
}

const DraggableHeader = ({ header, onResize }: DraggableHeaderProps) => {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: header.id,
    });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    transition: "width transform 0.2s ease-in-out",
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    zIndex: isDragging ? 2 : 0,
    cursor: "move",
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

  return (
    <div
      ref={setNodeRef}
      className={styles.th}
      style={style}
      {...(!isResizing ? { ...attributes, ...listeners } : {})}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <div className={styles.resizer} onMouseDown={handleResizeStart} />
    </div>
  );
};

const DraggableCell = ({ cell }: DraggableCellProps) => {
  const { setNodeRef } = useSortable({
    id: cell.column.id,
  });

  const style: CSSProperties = {
    position: "relative",
    width: cell.column.getSize(),
  };

  return (
    <div ref={setNodeRef} className={styles.td} style={style}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  );
};

const useVirtualGrid = ({
  bodyRef,
  table,
  data,
  columns,
  columnFormatters,
  measureBodyCellDimensions,
}: UseVirtualGridProps) => {
  const wrappedColumns = useMemo(() => {
    return columns.filter(col => col.wrap);
  }, [columns]);

  const { rows: tableRows } = table.getRowModel();
  const visibleColumns = table.getVisibleLeafColumns();

  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: index => visibleColumns[index].getSize(),
    horizontal: true,
    overscan: 5,
  });

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    getItemKey: index => tableRows[index].id,
    measureElement: element => {
      const rowIndex = element?.getAttribute("data-index");

      if (!rowIndex || wrappedColumns.length === 0) {
        return ROW_HEIGHT;
      }

      const height = Math.max(
        ...wrappedColumns.map(column => {
          const value = data.rows[parseInt(rowIndex, 10)][column.datasetIndex];
          const formattedValue = columnFormatters[column.datasetIndex](value);
          return measureBodyCellDimensions(formattedValue, column.size).height;
        }, ROW_HEIGHT),
      );

      return height;
    },
  });

  const virtualColumns = columnVirtualizer.getVirtualItems();
  const virtualRows = rowVirtualizer.getVirtualItems();

  let virtualPaddingLeft: number | undefined;
  let virtualPaddingRight: number | undefined;

  if (columnVirtualizer && virtualColumns?.length) {
    virtualPaddingLeft = virtualColumns[0]?.start ?? 0;
    virtualPaddingRight =
      columnVirtualizer.getTotalSize() -
      (virtualColumns[virtualColumns.length - 1]?.end ?? 0);
  }

  return {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
  };
};

export const _Table = ({
  data,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
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

      const { active, over } = event;
      if (active && over && active.id !== over.id) {
        const oldIndex = parseInt(active.id as string, 10);
        const newIndex = parseInt(over.id as string, 10);

        const columns = settings["table.columns"]?.slice() || [];
        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);

        const settingsUpdate = {
          "table.columns": columns,
        };

        const widths = settings["table.column_widths"];
        if (Array.isArray(widths) && widths.length > 0) {
          // TODO: what if this setting is outdated?
          const newWidths = widths.slice();
          newWidths.splice(newIndex, 0, newWidths.splice(oldIndex, 1)[0]);
        }
        onUpdateVisualizationSettings(settingsUpdate);

        setColumnOrder(columnOrder => {
          const oldIndex = columnOrder.indexOf(active.id as string);
          const newIndex = columnOrder.indexOf(over.id as string);
          return arrayMove(columnOrder, oldIndex, newIndex);
        });
      }
    },
    [settings, onUpdateVisualizationSettings],
  );

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
    },
    [columnWidths, onUpdateVisualizationSettings],
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

  const measureRef = useCallback(
    (element: HTMLElement | null) => {
      rowVirtualizer.measureElement(element);
    },
    [rowVirtualizer],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ height, width }} className={styles.table}>
        <div ref={bodyRef} className={styles.tableContainer}>
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
                    <SortableContext
                      items={columnOrder}
                      strategy={horizontalListSortingStrategy}
                    >
                      {virtualColumns.map(virtualColumn => {
                        const cell = row.getVisibleCells()[virtualColumn.index];
                        return <DraggableCell key={cell.id} cell={cell} />;
                      })}
                    </SortableContext>
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

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
import {
  type CSSProperties,
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { VisualizationProps } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import type { RowValues, VisualizationSettings } from "metabase-types/api";

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

interface DraggableHeaderProps {
  header: Header<RowValues, unknown>;
  isPivoted?: boolean;
  timezone: string | undefined;
  hasMetadataPopovers?: boolean;
  question: Question;
}

const DraggableHeader = ({
  header,
  isPivoted,
  question,
  timezone,
  hasMetadataPopovers,
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

  const dndProps = {
    ...attributes,
    ...listeners,
  };

  const resizeHandler = header.getResizeHandler();

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      resizeHandler(e);
    },
    [resizeHandler],
  );

  const column = header.column.columnDef.meta?.column;

  if (!column) {
    return null;
  }
  const query = question?.query();
  const stageIndex = -1;

  return (
    <div ref={setNodeRef} className={styles.th} style={style} {...dndProps}>
      <QueryColumnInfoPopover
        position="bottom-start"
        query={query}
        stageIndex={-1}
        column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
        timezone={timezone}
        disabled={!hasMetadataPopovers}
        openDelay={500}
        showFingerprintInfo
      >
        <div>
          {flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      </QueryColumnInfoPopover>
      <div
        className={styles.resizer}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      />
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
  question,
  hasMetadataPopovers = true,
}: TableProps) => {
  const { rows, cols, results_timezone } = data;
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
                            timezone={results_timezone}
                            question={question}
                            key={header.id}
                            header={header}
                            isPivoted={isPivoted}
                            hasMetadataPopovers={hasMetadataPopovers}
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

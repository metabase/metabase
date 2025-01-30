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
  pointerWithin,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { connect } from "metabase/lib/redux";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  getTableHeaderClickedObject,
} from "metabase/visualizations/lib/table";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { OrderByDirection } from "metabase-lib/types";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { AddColumnButton } from "./AddColumnButton";
import { SortableHeader } from "./SortableHeader";
import styles from "./Table.module.css";
import { HEADER_HEIGHT, INDEX_COLUMN_ID, ROW_HEIGHT } from "./constants";
import { useTableCellsMeasure } from "./hooks/use-cell-measure";
import { useColumnResizeObserver } from "./hooks/use-column-resize-observer";
import { useColumns } from "./hooks/use-columns";
import { useObjectDetail } from "./hooks/use-object-detail";
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

const getColumnOrder = (cols: DatasetColumn[], hasIndexColumn: boolean) => {
  const dataColumns = cols.map(col => col.name);
  if (!hasIndexColumn) {
    return dataColumns;
  }
  return [INDEX_COLUMN_ID, ...dataColumns];
};

export const _Table = ({
  data,
  series,
  height,
  settings,
  width,
  onVisualizationClick,
  onUpdateVisualizationSettings,
  isPivoted = false,
  getColumnSortDirection,
  question,
  clicked,
  hasMetadataPopovers = true,
}: TableProps) => {
  const { rows, cols } = data;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    getColumnOrder(cols, settings["table.row_index"]),
  );

  useEffect(() => {
    setColumnOrder(getColumnOrder(cols, settings["table.row_index"]));
  }, [cols, settings["table.row_index"]]);

  const {
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    measureRoot,
  } = useTableCellsMeasure();

  const {
    columns,
    columnFormatters,
    onResizeColumn,
    columnSizing,
    setColumnSizing,
  } = useColumns({
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

  const wrappedColumns = useMemo(() => {
    return columns.filter(col => col.meta?.wrap);
  }, [columns]);

  const table = useReactTable({
    data: rows,
    columns,
    initialState: {
      columnPinning: {
        left: [INDEX_COLUMN_ID],
      },
    },
    state: {
      columnSizing,
      columnOrder,
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
  });

  const onOpenObjectDetail = useObjectDetail(data);

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumns.length === 0) {
        return ROW_HEIGHT;
      }

      const height = Math.max(
        ...wrappedColumns.map(column => {
          const datasetIndex = column.meta?.datasetIndex;
          const columnName = column.id;
          if (!datasetIndex || !columnName) {
            return 0;
          }

          const value = data.rows[rowIndex][datasetIndex];
          const formattedValue = columnFormatters[datasetIndex](value);
          if (!formattedValue || _.isEmpty(formattedValue)) {
            return ROW_HEIGHT;
          }
          const formattedString = formattedValue?.toString() ?? "";
          const tableColumn = table.getColumn(columnName);

          const cellDimensions = measureBodyCellDimensions(
            formattedString,
            tableColumn?.getSize(),
          );
          return cellDimensions.height;
        }),
        ROW_HEIGHT,
      );

      return height;
    },
    [
      columnFormatters,
      data.rows,
      measureBodyCellDimensions,
      table,
      wrappedColumns,
    ],
  );

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
      setColumnOrder(columnOrder => {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        return arrayMove(columnOrder, oldIndex, newIndex);
      });
    }
  }, []);

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      if (bodyRef.current) {
        bodyRef.current.style.overflow = "auto";
      }

      if (isPivoted) {
        return;
      }

      const columns = settings["table.columns"]?.slice() ?? [];

      const enabledColumns = columns
        .map((c, index) => ({ ...c, index }))
        .filter(c => c.enabled);

      const columnOrderPositions = new Map(
        columnOrder.map((name, index) => [name, index]),
      );

      enabledColumns.sort(
        (a, b) =>
          (columnOrderPositions.get(a.name) ?? 0) -
          (columnOrderPositions.get(b.name) ?? 0),
      );

      const reorderedColumns = [...columns];
      enabledColumns.forEach((col, i) => {
        const prevCol = enabledColumns[i - 1];
        const targetIndex = prevCol ? prevCol.index + 1 : 0;
        if (targetIndex !== col.index) {
          reorderedColumns.splice(
            targetIndex,
            0,
            reorderedColumns.splice(col.index, 1)[0],
          );
        }
      });

      onUpdateVisualizationSettings({
        "table.columns": reorderedColumns,
      });
    },
    [columnOrder, settings, onUpdateVisualizationSettings, isPivoted],
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
    measureRowHeight,
  });

  const handleColumnResize = useCallback(
    (columnName: string, width: number) => {
      const newColumnWidths = onResizeColumn(columnName, width);

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

  const isAddColumnButtonSticky = table.getTotalSize() >= width;
  const hasAddColumnButton = onVisualizationClick != null;
  const addColumnButton = useMemo(
    () =>
      hasAddColumnButton ? (
        <AddColumnButton
          headerHeight={HEADER_HEIGHT}
          isOverflowing={isAddColumnButtonSticky}
          onClick={e =>
            onVisualizationClick?.({
              columnShortcuts: true,
              element: e.currentTarget,
            })
          }
        />
      ) : null,
    [isAddColumnButtonSticky, onVisualizationClick, hasAddColumnButton],
  );

  const handleBodyCellClick = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement, MouseEvent>,
      rowIndex: number,
      columnName: string,
    ) => {
      if (columnName === INDEX_COLUMN_ID) {
        onOpenObjectDetail(rowIndex);
        return;
      }

      const columnIndex = data.cols.findIndex(col => col.name === columnName);
      const clickedRowData = getTableClickedObjectRowData(
        series as any,
        rowIndex,
        columnIndex,
        isPivoted,
        data,
      );

      const clicked = getTableCellClickedObject(
        data,
        settings,
        rowIndex,
        columnIndex,
        isPivoted,
        clickedRowData,
      );

      onVisualizationClick?.({
        ...clicked,
        element: event.currentTarget,
      });
    },
    [
      data,
      isPivoted,
      onOpenObjectDetail,
      onVisualizationClick,
      series,
      settings,
    ],
  );

  const handleHeaderCellClick = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement, MouseEvent>,
      columnName: string,
    ) => {
      const columnIndex = data.cols.findIndex(col => col.name === columnName);
      if (columnIndex === -1) {
        return;
      }
      const clicked = getTableHeaderClickedObject(data, columnIndex, isPivoted);
      onVisualizationClick({ ...clicked, element: event.currentTarget });
    },
    [data, isPivoted, onVisualizationClick],
  );

  if (width == null || height == null) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div style={{ height, width }} className={styles.table} tabIndex={-1}>
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
                      const datasetColumn =
                        header.column.columnDef.meta?.column;
                      const isDataColumn = datasetColumn != null;

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
                          {isDataColumn ? (
                            <SortableHeader
                              id={header.id}
                              column={datasetColumn}
                              data={data}
                              question={question}
                              canSort={!isPivoted}
                              hasMetadataPopovers={
                                hasMetadataPopovers && clicked == null
                              }
                              header={header}
                              onClick={event =>
                                handleHeaderCellClick(event, datasetColumn.name)
                              }
                            >
                              {headerCell}
                            </SortableHeader>
                          ) : (
                            headerCell
                          )}
                        </div>
                      );
                    })}
                  </SortableContext>
                  {!isAddColumnButtonSticky ? addColumnButton : null}
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
                          onClick={e =>
                            handleBodyCellClick(
                              e,
                              cell.row.index,
                              cell.column.id,
                            )
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
        {isAddColumnButtonSticky ? addColumnButton : null}
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

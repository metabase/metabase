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

import { formatValue } from "metabase/lib/formatting";
import { connect } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import {
  getIsShowingRawTable,
  getQueryBuilderMode,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { cachedFormatter } from "metabase/visualizations/echarts/cartesian/utils/formatter";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  isFK,
  isNumber,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetData,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import styles from "./Table.module.css";
import { BodyCell } from "./cell/BodyCell";
import { HeaderCell } from "./cell/HeaderCell";
import { useTableCellsMeasure } from "./hooks/use-cell-measure";

const ROW_HEIGHT = 36;
const MIN_COLUMN_WIDTH = 60;
const DEFAULT_COLUMN_WIDTH = 150;

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

interface UseColumnsProps {
  cols: DatasetData["cols"];
  columnWidths: number[];
  settings: ComputedVisualizationSettings;
  onVisualizationClick?: (args: any) => void;
  data: DatasetData;
  measureBodyCellDimensions: (value: any, width: number) => { width: number };
  measureHeaderCellDimensions: (value: any, width: number) => { width: number };
  isMeasureRootMounted: boolean;
}

interface UseVirtualGridProps {
  bodyRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<RowValues>;
  data: DatasetData;
  columnFormatters: ((value: RowValue) => any)[];
  descriptionIndices: number[];
  measureBodyCellDimensions: (value: any, width: number) => { height: number };
}

function pickRowsToMeasure(
  rows: DatasetData["rows"],
  columnIndex: number,
  count = 10,
) {
  const rowIndexes = [];
  for (
    let rowIndex = 0;
    rowIndex < rows.length && rowIndexes.length < count;
    rowIndex++
  ) {
    if (rows[rowIndex][columnIndex] != null) {
      rowIndexes.push(rowIndex);
    }
  }
  return rowIndexes;
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

const useColumns = ({
  cols,
  columnWidths,
  settings,
  onVisualizationClick,
  data,
  measureBodyCellDimensions,
  measureHeaderCellDimensions,
  isMeasureRootMounted,
}: UseColumnsProps) => {
  const columnFormatters = useMemo(() => {
    return cols.map(col => {
      const columnSettings = settings.column?.(col);
      return cachedFormatter(value =>
        formatValue(value, {
          ...columnSettings,
          column: col,
          type: "cell",
          jsx: true,
          rich: true,
        }),
      );
    });
  }, [cols, settings]);

  const columns = useMemo(() => {
    return cols.map((col, index) => {
      const align = isNumber(col) ? "right" : "left";
      const isPill = isPK(col) || isFK(col);

      let columnWidth = columnWidths[index];
      if (!columnWidth && isMeasureRootMounted) {
        const headerWidth = measureHeaderCellDimensions(
          col.display_name,
          0,
        ).width;

        const sampleRows = pickRowsToMeasure(data.rows, index);
        const cellWidths = sampleRows.map(rowIndex => {
          const value = data.rows[rowIndex][index];
          const formattedValue = columnFormatters[index](value);
          return measureBodyCellDimensions(formattedValue, 0).width;
        });

        columnWidth = Math.max(headerWidth, ...cellWidths, MIN_COLUMN_WIDTH);
      } else if (!columnWidth) {
        columnWidth = DEFAULT_COLUMN_WIDTH;
      }

      return {
        id: index.toString(),
        accessorFn: (row: RowValues) => row[index],
        header: () => (
          <HeaderCell
            name={col.display_name}
            align={align}
            onClick={event =>
              onVisualizationClick?.({
                column: col,
                element: event.currentTarget,
              })
            }
          />
        ),
        cell: (props: { getValue: () => RowValue; row: { index: number } }) => {
          const value = props.getValue();
          const backgroundColor = settings["table._cell_background_getter"]?.(
            value,
            props.row.index,
            col.name,
          );

          return (
            <BodyCell
              variant={isPill ? "pill" : "text"}
              value={value}
              formatter={columnFormatters[index]}
              align={align}
              backgroundColor={backgroundColor}
              onClick={event => {
                onVisualizationClick?.({
                  value,
                  column: col,
                  element: event.currentTarget,
                });
              }}
            />
          );
        },
        size: columnWidth,
      };
    });
  }, [
    cols,
    columnFormatters,
    onVisualizationClick,
    settings,
    columnWidths,
    data.rows,
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    isMeasureRootMounted,
  ]);

  return { columns, columnFormatters };
};

const useVirtualGrid = ({
  bodyRef,
  table,
  data,
  columnFormatters,
  descriptionIndices,
  measureBodyCellDimensions,
}: UseVirtualGridProps) => {
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
      if (!rowIndex) {
        return ROW_HEIGHT;
      }

      const height = Math.max(
        ...descriptionIndices.map(colIndex => {
          const value = data.rows[parseInt(rowIndex, 10)][colIndex];
          const formattedValue = columnFormatters[colIndex](value);
          const columnWidth = 150;
          return measureBodyCellDimensions(formattedValue, columnWidth).height;
        }),
      );

      return height || ROW_HEIGHT;
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
  const [isMeasureRootMounted, setIsMeasureRootMounted] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    cols.map((_col, index) => index.toString()),
  );

  const descriptionIndices = useMemo(() => {
    return data.cols
      .map((col, index) => (isString(col) ? index : null))
      .filter(isNotNull);
  }, [data.cols]);

  const columnWidths = useMemo(
    () => settings["table.column_widths"] || [],
    [settings],
  );

  const {
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    measureRoot,
  } = useTableCellsMeasure();

  const measureRootRef = useCallback((node: HTMLElement | null) => {
    setIsMeasureRootMounted(!!node);
  }, []);

  const { columns, columnFormatters } = useColumns({
    cols,
    columnWidths,
    settings,
    onVisualizationClick,
    data,
    measureBodyCellDimensions,
    measureHeaderCellDimensions,
    isMeasureRootMounted,
  });

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnOrder,
    },
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
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

        onUpdateVisualizationSettings({
          "table.columns": columns,
        });

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
    columnFormatters,
    descriptionIndices,
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
      <div ref={measureRootRef}>{measureRoot}</div>
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

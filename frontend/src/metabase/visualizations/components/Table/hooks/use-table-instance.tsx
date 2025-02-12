import {
  type ColumnDef,
  type ColumnSizingState,
  type Table,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import {
  type MouseEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUpdateEffect } from "react-use";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";

import type { TableProps, TableRefs } from "../Table";
import { getDataColumn } from "../columns/data-column";
import { getRowIdColumn } from "../columns/row-id-column";
import {
  MIN_COLUMN_WIDTH,
  ROW_ID_COLUMN_ID,
  TRUNCATE_LONG_CELL_WIDTH,
} from "../constants";
import type {
  BodyCellVariant,
  CellFormatter,
  ExpandedColumnsState,
  RowIdVariant,
  TextAlign,
} from "../types";

import { useTableCellsMeasure } from "./use-cell-measure";
import { useColumnResizeObserver } from "./use-column-resize-observer";
import {
  type ColumnsReordering,
  useColumnsReordering,
} from "./use-columns-reordering";
import { useMeasureColumnWidths } from "./use-measure-column-widths";
import { type VirtualGrid, useVirtualGrid } from "./use-virtual-grid";

export interface ColumnOptions<TRow, TValue> {
  id: string;
  name: string;
  accessorFn: (row: TRow) => TValue;
  cellVariant: BodyCellVariant;
  align?: TextAlign;
  wrap?: boolean;
  sortDirection?: "asc" | "desc";
  enableResizing: boolean;
  getBackgroundColor: (value: TValue, rowIndex: number) => string;
  formatter?: CellFormatter<TValue>;
  // Needed for minibar variant
  getColumnExtent: () => [number, number];
}

export interface TableOptions<TData, TValue> {
  data: TData[];
  columnOrder?: string[];
  columnSizing?: ColumnSizingState;
  defaultRowHeight?: number;
  rowIdColumn?: RowIdVariant;
  truncateLongCellWidth?: number;
  columnsOptions: ColumnOptions<TData, TValue>[];
  onColumnResize?: (columnSizing: ColumnSizingState) => void;
  onColumnReorder?: (columnNames: string[]) => void;
}

export interface TableInstance<TData> {
  table: Table<TData>;
  refs: TableRefs;
  virtualGrid: VirtualGrid;
  measureRoot: React.ReactNode;
  columnsReordering: ColumnsReordering;
  measureColumnWidths: (updateCurrent?: boolean, truncate?: boolean) => void;
  renderHeaderDecorator?: (
    columnId: string,
    isDragging: boolean,
    children: React.ReactNode,
  ) => React.ReactNode;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    rowIndex: number,
    columnId: string,
  ) => void;
  onHeaderCellClick?: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    columnId: string,
  ) => void;
  onAddColumnClick?: MouseEventHandler<HTMLButtonElement>;
}

const getColumnOrder = (dataColumnsOrder: string[], hasRowIdColumn: boolean) =>
  _.uniq(
    hasRowIdColumn ? [ROW_ID_COLUMN_ID, ...dataColumnsOrder] : dataColumnsOrder,
  );

export const useTableInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder = [],
  columnSizing: controlledColumnSizing = {},
  defaultRowHeight = 36,
  rowIdColumn,
  truncateLongCellWidth = TRUNCATE_LONG_CELL_WIDTH,
  columnsOptions,
  onColumnResize,
  onColumnReorder,
}: TableOptions<TData, TValue>): Omit<
  TableProps<TData>,
  "width" | "height"
> => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => ({ bodyRef }), [bodyRef]);
  const hasRowIdColumn = rowIdColumn != null;

  const [columnOrder, setColumnOrder] = useState<string[]>(
    getColumnOrder(controlledColumnOrder, hasRowIdColumn),
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    controlledColumnSizing,
  );
  const [measuredColumnSizing, setMeasuredColumnSizing] =
    useState<ColumnSizingState>({});

  const [expandedColumns, setExpandedColumns] = useState<ExpandedColumnsState>(
    () => {
      return columnsOptions.reduce(
        (acc: ExpandedColumnsState, columnOptions) => {
          acc[columnOptions.id] = false;
          return acc;
        },
        {},
      );
    },
  );

  const { measureBodyCellDimensions, measureRoot } = useTableCellsMeasure();

  useUpdateEffect(() => {
    setColumnOrder(getColumnOrder(controlledColumnOrder, hasRowIdColumn));
  }, [controlledColumnOrder, hasRowIdColumn]);

  const handleUpdateColumnExpanded = useCallback(
    (columnName: string, isExpanded = true) => {
      setExpandedColumns(prev => {
        return { ...prev, [columnName]: isExpanded };
      });
    },
    [],
  );

  const handleExpandButtonClick = useCallback(
    (columnName: string, content: React.ReactNode) => {
      if (typeof content !== "string") {
        throw new Error("Columns with rich formatting cannot be truncated");
      }

      const newColumnWidth = Math.max(
        measureBodyCellDimensions(content).width,
        measuredColumnSizing[columnName],
      );
      const newColumnSizing = { ...columnSizing, [columnName]: newColumnWidth };

      setColumnSizing(newColumnSizing);

      handleUpdateColumnExpanded(columnName);
    },
    [
      columnSizing,
      measureBodyCellDimensions,
      measuredColumnSizing,
      handleUpdateColumnExpanded,
    ],
  );

  const columns: ColumnDef<TData, TValue>[] = useMemo(() => {
    const rowIdColumnDefinition =
      rowIdColumn != null ? getRowIdColumn(rowIdColumn) : null;

    const dataColumns = columnsOptions.map(options => {
      return getDataColumn(
        options,
        columnSizing,
        measuredColumnSizing,
        expandedColumns,
        truncateLongCellWidth,
        handleExpandButtonClick,
      );
    });

    return [rowIdColumnDefinition, ...dataColumns].filter(isNotNull);
  }, [
    columnSizing,
    columnsOptions,
    expandedColumns,
    handleExpandButtonClick,
    measuredColumnSizing,
    rowIdColumn,
    truncateLongCellWidth,
  ]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing,
      columnOrder,
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
  });

  const measureColumnWidths = useMeasureColumnWidths(
    table,
    data,
    columnsOptions,
    setMeasuredColumnSizing,
    truncateLongCellWidth,
  );

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      const wrappedColumns = columnsOptions.filter(column => column.wrap);
      if (wrappedColumns.length === 0) {
        return defaultRowHeight;
      }

      const height = Math.max(
        ...wrappedColumns.map(column => {
          const value = column.accessorFn(data[rowIndex]);
          const formattedValue = column.formatter?.(value);
          if (
            value == null ||
            typeof formattedValue !== "string" ||
            formattedValue === ""
          ) {
            return defaultRowHeight;
          }
          const tableColumn = table.getColumn(column.id);

          const cellDimensions = measureBodyCellDimensions(
            formattedValue,
            tableColumn?.getSize(),
          );
          return cellDimensions.height;
        }),
        defaultRowHeight,
      );

      return height;
    },
    [columnsOptions, data, defaultRowHeight, measureBodyCellDimensions, table],
  );

  const virtualGrid = useVirtualGrid({
    bodyRef,
    table,
    defaultRowHeight,
    measureRowHeight,
  });

  const handleColumnResize = useCallback(
    (columnName: string, width: number) => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, width);
      const newColumnSizing = { ...columnSizing, [columnName]: newWidth };
      setColumnSizing(newColumnSizing);

      if (newWidth > truncateLongCellWidth) {
        handleUpdateColumnExpanded(columnName);
      }

      virtualGrid.measureGrid();
      onColumnResize?.(newColumnSizing);
    },
    [
      columnSizing,
      onColumnResize,
      handleUpdateColumnExpanded,
      truncateLongCellWidth,
      virtualGrid,
    ],
  );

  useColumnResizeObserver(table.getState(), handleColumnResize);

  const columnsReordering = useColumnsReordering(
    bodyRef,
    table,
    onColumnReorder,
  );

  return {
    table,
    refs,
    virtualGrid,
    measureRoot,
    columnsReordering,
    measureColumnWidths,
  };
};

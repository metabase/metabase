import {
  type ColumnSizingState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpdateEffect } from "react-use";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";

import type { TableProps } from "../Table";
import { getDataColumn } from "../columns/data-column";
import { getRowIdColumn } from "../columns/row-id-column";
import {
  MIN_COLUMN_WIDTH,
  ROW_ID_COLUMN_ID,
  TRUNCATE_LONG_CELL_WIDTH,
} from "../constants";
import type { ExpandedColumnsState, TableOptions } from "../types";

import { useTableCellsMeasure } from "./use-cell-measure";
import { useColumnResizeObserver } from "./use-column-resize-observer";
import { useColumnsReordering } from "./use-columns-reordering";
import { useMeasureColumnWidths } from "./use-measure-column-widths";
import { useVirtualGrid } from "./use-virtual-grid";

const getColumnOrder = (dataColumnsOrder: string[], hasRowIdColumn: boolean) =>
  _.uniq(
    hasRowIdColumn ? [ROW_ID_COLUMN_ID, ...dataColumnsOrder] : dataColumnsOrder,
  );

export const useTableInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder = [],
  columnSizing: controlledColumnSizing = {},
  defaultRowHeight = 36,
  rowId,
  truncateLongCellWidth = TRUNCATE_LONG_CELL_WIDTH,
  columnsOptions,
  onColumnResize,
  onColumnReorder,
}: TableOptions<TData, TValue>): Omit<
  TableProps<TData>,
  "width" | "height"
> => {
  const gridRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => ({ gridRef }), [gridRef]);
  const hasRowIdColumn = rowId != null;

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

  const columns = useMemo(() => {
    const rowIdColumnDefinition =
      rowId != null ? getRowIdColumn<TData, TValue>(rowId) : null;

    const dataColumns = columnsOptions.map(options =>
      getDataColumn<TData, TValue>(
        options,
        columnSizing,
        measuredColumnSizing,
        expandedColumns,
        truncateLongCellWidth,
        handleExpandButtonClick,
      ),
    );

    return [rowIdColumnDefinition, ...dataColumns].filter(isNotNull);
  }, [
    rowId,
    columnsOptions,
    columnSizing,
    measuredColumnSizing,
    expandedColumns,
    truncateLongCellWidth,
    handleExpandButtonClick,
  ]);

  const wrappedColumnsOptions = useMemo(() => {
    return columnsOptions.filter(column => column.wrap);
  }, [columnsOptions]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing,
      columnOrder,
      columnPinning: { left: [ROW_ID_COLUMN_ID] },
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
  });

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      const height = Math.max(
        ...wrappedColumnsOptions.map(column => {
          const value = column.accessorFn(data[rowIndex]);
          const formattedValue = column.formatter?.(value, rowIndex, column.id);
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
    [
      columnsOptions,
      data,
      defaultRowHeight,
      measureBodyCellDimensions,
      table,
      wrappedColumnsOptions,
    ],
  );

  const virtualGrid = useVirtualGrid({
    gridRef,
    table,
    defaultRowHeight,
    measureRowHeight,
  });

  const measureColumnWidths = useMeasureColumnWidths(
    table,
    data,
    columnsOptions,
    setMeasuredColumnSizing,
    truncateLongCellWidth,
  );

  const prevColumnSizing = useRef<ColumnSizingState>();
  const prevWrappedColumns = useRef<string[]>();
  useEffect(() => {
    const didColumnSizingChange =
      prevColumnSizing.current != null &&
      !_.isEqual(prevColumnSizing.current, columnSizing);

    const didColumnWrappingChange =
      prevWrappedColumns.current != null &&
      !_.isEqual(
        wrappedColumnsOptions.map(column => column.id),
        prevWrappedColumns.current,
      );

    if (didColumnSizingChange || didColumnWrappingChange) {
      virtualGrid.measureGrid();
    }

    prevColumnSizing.current = columnSizing;
    prevWrappedColumns.current = wrappedColumnsOptions.map(column => column.id);
  }, [columnSizing, virtualGrid]);

  const handleColumnResize = useCallback(
    (columnName: string, width: number) => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, width);
      const newColumnSizing = { ...columnSizing, [columnName]: newWidth };
      setColumnSizing(newColumnSizing);

      if (newWidth > truncateLongCellWidth) {
        handleUpdateColumnExpanded(columnName);
      }

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

  const columnsReordering = useColumnsReordering(table, onColumnReorder);

  return {
    table,
    refs,
    virtualGrid,
    measureRoot,
    columnsReordering,
    measureColumnWidths,
  };
};

import {
  type ColumnSizingState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpdateEffect } from "react-use";
import _ from "underscore";

import type { DataGridProps } from "metabase/data-grid/components/DataGrid/DataGrid";
import {
  MIN_COLUMN_WIDTH,
  ROW_ID_COLUMN_ID,
  TRUNCATE_LONG_CELL_WIDTH,
} from "metabase/data-grid/constants";
import { useBodyCellMeasure } from "metabase/data-grid/hooks/use-body-cell-measure";
import { useColumnResizeObserver } from "metabase/data-grid/hooks/use-column-resize-observer";
import { useColumnsReordering } from "metabase/data-grid/hooks/use-columns-reordering";
import { useMeasureColumnWidths } from "metabase/data-grid/hooks/use-measure-column-widths";
import { useVirtualGrid } from "metabase/data-grid/hooks/use-virtual-grid";
import type {
  DataGridOptions,
  ExpandedColumnsState,
} from "metabase/data-grid/types";
import { getDataColumn } from "metabase/data-grid/utils/columns/data-column";
import { getRowIdColumn } from "metabase/data-grid/utils/columns/row-id-column";
import { isNotNull } from "metabase/lib/types";

const getColumnOrder = (dataColumnsOrder: string[], hasRowIdColumn: boolean) =>
  _.uniq(
    hasRowIdColumn ? [ROW_ID_COLUMN_ID, ...dataColumnsOrder] : dataColumnsOrder,
  );

export const useDataGridInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder,
  columnSizingMap: controlledColumnSizingMap,
  defaultRowHeight = 36,
  rowId,
  truncateLongCellWidth = TRUNCATE_LONG_CELL_WIDTH,
  columnsOptions,
  theme,
  onColumnResize,
  onColumnReorder,
  measurementRenderWrapper,
}: DataGridOptions<TData, TValue>): DataGridProps<TData> => {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasRowIdColumn = rowId != null;

  const [columnOrder, setColumnOrder] = useState<string[]>(
    getColumnOrder(
      controlledColumnOrder ?? columnsOptions.map(column => column.id),
      hasRowIdColumn,
    ),
  );

  const [columnSizingMap, setColumnSizingMap] = useState<ColumnSizingState>(
    controlledColumnSizingMap ?? {},
  );
  const [measuredColumnSizingMap, setMeasuredColumnSizingMap] =
    useState<ColumnSizingState>({});

  const [expandedColumnsMap, setExpandedColumnsMap] =
    useState<ExpandedColumnsState>(() => {
      return columnsOptions.reduce(
        (acc: ExpandedColumnsState, columnOptions) => {
          acc[columnOptions.id] = false;
          return acc;
        },
        {},
      );
    });

  const { measureBodyCellDimensions, measureRoot } = useBodyCellMeasure(theme);

  useUpdateEffect(() => {
    setColumnOrder(getColumnOrder(controlledColumnOrder ?? [], hasRowIdColumn));
  }, [controlledColumnOrder, hasRowIdColumn]);

  const handleUpdateColumnExpanded = useCallback(
    (columnName: string, isExpanded = true) => {
      setExpandedColumnsMap(prev => {
        return { ...prev, [columnName]: isExpanded };
      });
    },
    [],
  );

  const handleExpandButtonClick = useCallback(
    (columnName: string, content: React.ReactNode) => {
      if (typeof content !== "string") {
        throw new Error("Columns with rich formatting cannot be expanded");
      }

      const newColumnWidth = Math.max(
        measureBodyCellDimensions(content).width,
        measuredColumnSizingMap[columnName],
      );
      const newColumnSizing = {
        ...columnSizingMap,
        [columnName]: newColumnWidth,
      };

      setColumnSizingMap(newColumnSizing);

      handleUpdateColumnExpanded(columnName);
    },
    [
      columnSizingMap,
      measureBodyCellDimensions,
      measuredColumnSizingMap,
      handleUpdateColumnExpanded,
    ],
  );

  const columns = useMemo(() => {
    const rowIdColumnDefinition =
      rowId != null ? getRowIdColumn<TData, TValue>(rowId) : null;

    const dataColumns = columnsOptions.map(options =>
      getDataColumn<TData, TValue>(
        options,
        columnSizingMap,
        measuredColumnSizingMap,
        expandedColumnsMap,
        truncateLongCellWidth,
        handleExpandButtonClick,
      ),
    );

    return [rowIdColumnDefinition, ...dataColumns].filter(isNotNull);
  }, [
    rowId,
    columnsOptions,
    columnSizingMap,
    measuredColumnSizingMap,
    expandedColumnsMap,
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
      columnSizing: columnSizingMap,
      columnOrder,
      columnPinning: { left: [ROW_ID_COLUMN_ID] },
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizingMap,
  });

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      const height = Math.max(
        ...wrappedColumnsOptions.map(column => {
          const value = column.accessorFn(data[rowIndex]);
          const formattedValue = column.formatter
            ? column.formatter(value, rowIndex, column.id)
            : value;
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
    truncateLongCellWidth,
    theme,
    setMeasuredColumnSizingMap,
    measurementRenderWrapper,
  );

  const { measureGrid } = virtualGrid;
  const prevColumnSizing = useRef<ColumnSizingState>();
  const prevWrappedColumns = useRef<string[]>();
  useEffect(() => {
    const didColumnSizingChange =
      prevColumnSizing.current != null &&
      !_.isEqual(prevColumnSizing.current, columnSizingMap);

    const didColumnWrappingChange =
      prevWrappedColumns.current != null &&
      !_.isEqual(
        wrappedColumnsOptions.map(column => column.id),
        prevWrappedColumns.current,
      );

    if (didColumnSizingChange || didColumnWrappingChange) {
      measureGrid();
    }

    prevColumnSizing.current = columnSizingMap;
    prevWrappedColumns.current = wrappedColumnsOptions.map(column => column.id);
  }, [columnSizingMap, measureGrid, wrappedColumnsOptions]);

  const handleColumnResize = useCallback(
    (columnName: string, width: number) => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, width);
      const newColumnSizing = { ...columnSizingMap, [columnName]: newWidth };
      setColumnSizingMap(newColumnSizing);

      if (newWidth > truncateLongCellWidth) {
        handleUpdateColumnExpanded(columnName);
      }

      onColumnResize?.(newColumnSizing);
    },
    [
      columnSizingMap,
      onColumnResize,
      handleUpdateColumnExpanded,
      truncateLongCellWidth,
    ],
  );

  useColumnResizeObserver(table.getState(), handleColumnResize);

  const columnsReordering = useColumnsReordering(
    table,
    gridRef,
    onColumnReorder,
  );

  return {
    table,
    theme,
    gridRef,
    virtualGrid,
    measureRoot,
    columnsReordering,
    measureColumnWidths,
  };
};

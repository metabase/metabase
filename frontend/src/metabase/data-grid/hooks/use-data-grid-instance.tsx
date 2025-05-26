import {
  type ColumnSizingState,
  type PaginationState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrevious, useUpdateEffect } from "react-use";
import _ from "underscore";

import {
  MIN_COLUMN_WIDTH,
  ROW_ACTIONS_COLUMN_ID,
  ROW_ID_COLUMN_ID,
  TRUNCATE_LONG_CELL_WIDTH,
} from "metabase/data-grid/constants";
import { useBodyCellMeasure } from "metabase/data-grid/hooks/use-body-cell-measure";
import { useColumnResizeObserver } from "metabase/data-grid/hooks/use-column-resize-observer";
import { useColumnsReordering } from "metabase/data-grid/hooks/use-columns-reordering";
import { useMeasureColumnWidths } from "metabase/data-grid/hooks/use-measure-column-widths";
import { useVirtualGrid } from "metabase/data-grid/hooks/use-virtual-grid";
import type {
  DataGridInstance,
  DataGridOptions,
  ExpandedColumnsState,
} from "metabase/data-grid/types";
import { getDataColumn } from "metabase/data-grid/utils/columns/data-column";
import { getActionsIdColumn } from "metabase/data-grid/utils/columns/row-actions-column";
import { getRowIdColumn } from "metabase/data-grid/utils/columns/row-id-column";
import { isNotNull } from "metabase/lib/types";

import { useCellSelection } from "./use-cell-selection";

// Setting pageSize to -1 to render all items
const DISABLED_PAGINATION_STATE = { pageSize: -1, pageIndex: 0 };

const getColumnOrder = (
  dataColumnsOrder: string[],
  {
    hasRowIdColumn,
    hasRowActionsColumn,
  }: {
    hasRowIdColumn: boolean;
    hasRowActionsColumn: boolean;
  },
) => {
  const resultColumnsOrder = [...dataColumnsOrder];

  if (hasRowIdColumn) {
    resultColumnsOrder.unshift(ROW_ID_COLUMN_ID);
  }

  if (hasRowActionsColumn) {
    resultColumnsOrder.push(ROW_ACTIONS_COLUMN_ID);
  }

  return _.uniq(resultColumnsOrder);
};

export const useDataGridInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder,
  columnSizingMap: controlledColumnSizingMap,
  columnVisibility: controlledColumnVisibility,
  columnPinning: controlledColumnPinning,
  sorting,
  defaultRowHeight = 36,
  rowId,
  truncateLongCellWidth = TRUNCATE_LONG_CELL_WIDTH,
  columnsOptions,
  columnRowSelectOptions,
  theme,
  pageSize,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  enableSelection,
  onColumnResize,
  onColumnReorder,
  measurementRenderWrapper,
  rowActionsColumn,
}: DataGridOptions<TData, TValue>): DataGridInstance<TData> => {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasRowIdColumn = rowId != null;
  const hasRowActionsColumn =
    rowActionsColumn != null && rowActionsColumn.actions.length > 0;

  const [columnOrder, setColumnOrder] = useState<string[]>(
    getColumnOrder(
      controlledColumnOrder ?? columnsOptions.map((column) => column.id),
      {
        hasRowIdColumn,
        hasRowActionsColumn,
      },
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

  // useEffect and useUpdateEffect is triggered after render, which causes flickering for controlled column order
  useLayoutEffect(() => {
    setColumnOrder(
      getColumnOrder(controlledColumnOrder ?? [], {
        hasRowIdColumn,
        hasRowActionsColumn,
      }),
    );
  }, [controlledColumnOrder, hasRowActionsColumn, hasRowIdColumn]);

  const handleUpdateColumnExpanded = useCallback(
    (columnName: string, isExpanded = true) => {
      setExpandedColumnsMap((prev) => {
        return { ...prev, [columnName]: isExpanded };
      });
    },
    [],
  );

  const handleExpandButtonClick = useCallback(
    (columnName: string, content: React.ReactNode) => {
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

    const rowActionsColumnDefinition =
      rowActionsColumn != null
        ? getActionsIdColumn<TData, TValue>(rowActionsColumn)
        : null;

    const dataColumns = columnsOptions.map((options) =>
      getDataColumn<TData, TValue>(
        options,
        columnSizingMap,
        measuredColumnSizingMap,
        expandedColumnsMap,
        truncateLongCellWidth,
        handleExpandButtonClick,
      ),
    );

    return [
      columnRowSelectOptions,
      rowIdColumnDefinition,
      ...dataColumns,
      rowActionsColumnDefinition,
    ].filter(isNotNull);
  }, [
    rowId,
    columnsOptions,
    columnRowSelectOptions,
    columnSizingMap,
    measuredColumnSizingMap,
    expandedColumnsMap,
    truncateLongCellWidth,
    handleExpandButtonClick,
    rowActionsColumn,
  ]);

  const wrappedColumnsOptions = useMemo(() => {
    return columnsOptions.filter((column) => column.wrap);
  }, [columnsOptions]);

  const [pagination, setPagination] = useState<PaginationState>(
    pageSize != null && pageSize > 0
      ? {
          pageIndex: 0,
          pageSize: pageSize ?? 0,
        }
      : DISABLED_PAGINATION_STATE,
  );

  useEffect(() => {
    if (pageSize != null && pageSize > 0) {
      setPagination((prev) => ({ ...prev, pageSize }));
    } else {
      setPagination(DISABLED_PAGINATION_STATE);
    }
  }, [pageSize]);

  const enablePagination =
    pagination?.pageSize !== DISABLED_PAGINATION_STATE.pageSize;

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing: columnSizingMap,
      columnOrder,
      columnPinning: controlledColumnPinning ?? { left: [ROW_ID_COLUMN_ID] },
      columnVisibility: controlledColumnVisibility,
      sorting,
      pagination,
      rowSelection: rowSelection ?? {},
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: enablePagination
      ? getPaginationRowModel()
      : undefined,
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizingMap,
    onPaginationChange: setPagination,
    onRowSelectionChange,
    enableRowSelection,
  });

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      const height = Math.max(
        ...wrappedColumnsOptions.map((column) => {
          const value = column.accessorFn(data[rowIndex]);
          const formattedValue = column.formatter
            ? column.formatter(value, rowIndex, column.id)
            : String(value);

          if (value == null || formattedValue === "") {
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

  const enableRowVirtualization = !enablePagination;
  const virtualGrid = useVirtualGrid({
    gridRef,
    table,
    defaultRowHeight,
    measureRowHeight,
    enableRowVirtualization,
  });

  const measureColumnWidths = useMeasureColumnWidths(
    table,
    columnsOptions,
    truncateLongCellWidth,
    theme,
    setMeasuredColumnSizingMap,
    controlledColumnSizingMap,
    measurementRenderWrapper,
  );

  const { measureGrid, rowVirtualizer, columnVirtualizer } = virtualGrid;
  const prevColumnSizing = useRef<ColumnSizingState>();
  const prevWrappedColumns = useRef<string[]>();
  useEffect(() => {
    const didColumnSizingChange =
      prevColumnSizing.current != null &&
      !_.isEqual(prevColumnSizing.current, columnSizingMap);

    const didColumnWrappingChange =
      prevWrappedColumns.current != null &&
      !_.isEqual(
        wrappedColumnsOptions.map((column) => column.id),
        prevWrappedColumns.current,
      );

    if (didColumnSizingChange || didColumnWrappingChange) {
      measureGrid();
    }

    prevColumnSizing.current = columnSizingMap;
    prevWrappedColumns.current = wrappedColumnsOptions.map(
      (column) => column.id,
    );
  }, [columnSizingMap, measureGrid, wrappedColumnsOptions]);

  const handleColumnResize = useCallback(
    (columnName: string, width: number) => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, width);
      setColumnSizingMap({ ...columnSizingMap, [columnName]: newWidth });

      if (newWidth > truncateLongCellWidth) {
        handleUpdateColumnExpanded(columnName);
      }

      onColumnResize?.(columnName, newWidth);
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

  const scrollTo = useCallback(
    ({
      rowIndex,
      columnIndex,
    }: {
      rowIndex?: number;
      columnIndex?: number;
    }) => {
      if (rowIndex != null) {
        rowVirtualizer.scrollToIndex(rowIndex);
      }
      if (columnIndex != null) {
        columnVirtualizer.scrollToIndex(columnIndex);
      }
    },
    [rowVirtualizer, columnVirtualizer],
  );

  const selection = useCellSelection({
    gridRef,
    table,
    isEnabled: enableSelection,
    scrollTo,
  });

  const getTotalHeight = useCallback(() => {
    if (enableRowVirtualization) {
      return virtualGrid.rowVirtualizer.getTotalSize();
    }

    return table.getRowModel().rows.length * defaultRowHeight;
  }, [
    defaultRowHeight,
    enableRowVirtualization,
    table,
    virtualGrid.rowVirtualizer,
  ]);

  const getVisibleRows = useCallback(() => {
    if (enableRowVirtualization) {
      return virtualGrid.virtualRows.map((virtualRow) => {
        const row = table.getRowModel().rows[virtualRow.index];
        return {
          row,
          virtualRow,
        };
      });
    }

    return table.getRowModel().rows;
  }, [enableRowVirtualization, table, virtualGrid.virtualRows]);

  const previousPagination = usePrevious(pagination);
  useEffect(() => {
    // Auto-adjusts column widths during pagination when sizes aren't explicitly specified
    if (
      pagination.pageSize === DISABLED_PAGINATION_STATE.pageSize ||
      !previousPagination
    ) {
      return;
    }
    const hasAllColumnsExplicitlySized =
      Object.values(controlledColumnSizingMap ?? {}).length ===
      columnsOptions.length;

    const shouldMeasureColumnsForPage =
      !hasAllColumnsExplicitlySized &&
      (pagination.pageIndex !== previousPagination.pageIndex ||
        pagination.pageSize !== previousPagination.pageSize);

    if (shouldMeasureColumnsForPage) {
      measureColumnWidths(controlledColumnSizingMap);
    }
  }, [
    controlledColumnSizingMap,
    measureColumnWidths,
    pagination,
    columnsOptions,
    previousPagination,
  ]);

  // If the column widths are not provided anymore, measure the column widths.
  useUpdateEffect(() => {
    if (Object.keys(controlledColumnSizingMap ?? {}).length === 0) {
      measureColumnWidths(controlledColumnSizingMap, true);
    } else {
      setColumnSizingMap((prev) => ({ ...prev, ...controlledColumnSizingMap }));
    }
  }, [controlledColumnSizingMap]);

  // When the column widths are not provided for all columns, measure the column widths.
  // This can happen when new columns are added to the table.
  useUpdateEffect(() => {
    const hasSizingForAllColumns = columnsOptions.every((column) => {
      return columnSizingMap[column.id] != null;
    });

    if (!hasSizingForAllColumns) {
      measureColumnWidths(controlledColumnSizingMap);
    }
  }, [
    columnsOptions,
    columnSizingMap,
    controlledColumnSizingMap,
    measureColumnWidths,
  ]);

  return {
    table,
    theme,
    gridRef,
    virtualGrid,
    measureRoot,
    columnsReordering,
    selection,
    measureColumnWidths,
    enableRowVirtualization,
    getTotalHeight,
    getVisibleRows,
    enablePagination,
  };
};

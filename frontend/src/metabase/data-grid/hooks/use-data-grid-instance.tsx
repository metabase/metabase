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
import { getRowIdColumn } from "metabase/data-grid/utils/columns/row-id-column";
import { getScrollBarSize } from "metabase/lib/dom";
import { isNotNull } from "metabase/lib/types";

import { getTruncatedColumnSizing } from "../utils/column-sizing";
import { maybeExpandColumnWidths } from "../utils/maybe-expand-column-widths";

import { useCellSelection } from "./use-cell-selection";
import { useExpandColumnsToMinGridWidth } from "./use-expand-columns-to-min-grid-width";

// Disable pagination by setting pageSize to -1
const DISABLED_PAGINATION_STATE = { pageSize: -1, pageIndex: 0 };

// Creates a column order array with row ID column first if present
const getColumnOrder = (dataColumnsOrder: string[], hasRowIdColumn: boolean) =>
  _.uniq(
    hasRowIdColumn ? [ROW_ID_COLUMN_ID, ...dataColumnsOrder] : dataColumnsOrder,
  );

/**
 * Main hook for creating and managing a data grid instance.
 * Handles virtualization, column sizing/reordering, cell selection,
 * pagination, and row selection.
 */
export const useDataGridInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder,
  columnSizingMap: controlledColumnSizingMap,
  columnPinning: controlledColumnPinning,
  sorting,
  defaultRowHeight = 36,
  minGridWidth: minGridWidthProp,
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
}: DataGridOptions<TData, TValue>): DataGridInstance<TData> => {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasRowIdColumn = rowId != null;

  // Initialize column order (either controlled or from column options)
  const [columnOrder, setColumnOrder] = useState<string[]>(
    getColumnOrder(
      controlledColumnOrder ?? columnsOptions.map((column) => column.id),
      hasRowIdColumn,
    ),
  );

  // Track column widths (both controlled and measured)
  const [columnSizingMap, setColumnSizingMap] = useState<ColumnSizingState>(
    controlledColumnSizingMap ?? {},
  );
  const [measuredColumnSizingMap, setMeasuredColumnSizingMap] =
    useState<ColumnSizingState>({});

  // Track which columns are expanded
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

  // Update column order when controlled value changes
  useLayoutEffect(() => {
    setColumnOrder(getColumnOrder(controlledColumnOrder ?? [], hasRowIdColumn));
  }, [controlledColumnOrder, hasRowIdColumn]);

  // Handler for updating column expanded state
  const handleUpdateColumnExpanded = useCallback(
    (columnName: string, isExpanded = true) => {
      setExpandedColumnsMap((prev) => {
        return { ...prev, [columnName]: isExpanded };
      });
    },
    [],
  );

  // Handler for expand button click - expands column and adjusts width
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

  // Generate table columns configuration from options
  const columns = useMemo(() => {
    const rowIdColumnDefinition =
      rowId != null ? getRowIdColumn<TData, TValue>(rowId) : null;

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
  ]);

  // IDs of columns with fixed width that shouldn't be auto-resized
  const fixedWidthColumnIds = useMemo(() => {
    return [columnRowSelectOptions?.id, ROW_ID_COLUMN_ID].filter(isNotNull);
  }, [columnRowSelectOptions]);

  // Columns that need text wrapping
  const wrappedColumnsOptions = useMemo(() => {
    return columnsOptions.filter((column) => column.wrap);
  }, [columnsOptions]);

  // Pagination state management
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

  const minGridWidth = useMemo(() => {
    if (!minGridWidthProp) {
      return undefined;
    }

    return enablePagination
      ? minGridWidthProp
      : minGridWidthProp - getScrollBarSize();
  }, [enablePagination, minGridWidthProp]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing: columnSizingMap,
      columnOrder,
      columnPinning: controlledColumnPinning ?? { left: [ROW_ID_COLUMN_ID] },
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

  // Calculate dynamic row heights for wrapped columns
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

  // Enable row virtualization only when pagination is disabled
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
    theme,
    measurementRenderWrapper,
  );

  // Applies measured column widths with optional truncation or expansion
  const applyMeasuredColumnWidths = useCallback(
    async (
      preserveColumnSizingMap: ColumnSizingState = {},
      truncatePreserved?: boolean, // whether to truncate the preserved column widths
    ) => {
      const handleColumnsMeasured = (
        measuredColumnSizingMap: ColumnSizingState,
      ) => {
        // Combine measured and preserved widths, applying truncation as needed
        const columnSizingMap = truncatePreserved
          ? getTruncatedColumnSizing(
              { ...measuredColumnSizingMap, ...preserveColumnSizingMap },
              truncateLongCellWidth,
            )
          : {
              ...getTruncatedColumnSizing(
                measuredColumnSizingMap,
                truncateLongCellWidth,
              ),
              ...preserveColumnSizingMap,
            };

        const newWidths = maybeExpandColumnWidths(
          columnSizingMap,
          fixedWidthColumnIds,
          minGridWidth,
        );

        setMeasuredColumnSizingMap(measuredColumnSizingMap);
        setColumnSizingMap(newWidths);
      };

      measureColumnWidths(handleColumnsMeasured);
    },
    [
      measureColumnWidths,
      truncateLongCellWidth,
      fixedWidthColumnIds,
      minGridWidth,
    ],
  );

  // Initial measurement of column widths
  useLayoutEffect(() => {
    applyMeasuredColumnWidths(controlledColumnSizingMap, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { measureGrid, rowVirtualizer, columnVirtualizer } = virtualGrid;
  const prevColumnSizing = useRef<ColumnSizingState>();
  const prevWrappedColumns = useRef<string[]>();

  // Re-measure grid when column sizing or wrapping changes
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

  // Handle column resize from resize observer
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

  // Setup column reordering functionality
  const columnsReordering = useColumnsReordering(
    table,
    gridRef,
    onColumnReorder,
  );

  // Scroll to a specific row/column in the virtualized grid
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

  // Setup cell selection functionality
  const selection = useCellSelection({
    gridRef,
    table,
    isEnabled: enableSelection,
    scrollTo,
  });

  // Calculate total height of the grid based on rows
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

  // Get rows that should be currently visible in the viewport
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

  // Auto-adjust column widths when pagination changes
  const previousPagination = usePrevious(pagination);
  useEffect(() => {
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
      applyMeasuredColumnWidths(controlledColumnSizingMap);
    }
  }, [
    controlledColumnSizingMap,
    applyMeasuredColumnWidths,
    pagination,
    columnsOptions,
    previousPagination,
  ]);

  // Reset column widths if controlled sizing map is removed
  useUpdateEffect(() => {
    if (Object.keys(controlledColumnSizingMap ?? {}).length === 0) {
      applyMeasuredColumnWidths({}, true);
    } else {
      setColumnSizingMap((prev) => ({ ...prev, ...controlledColumnSizingMap }));
    }
  }, [controlledColumnSizingMap]);

  // Re-measure when new columns are added that don't have width set
  useUpdateEffect(() => {
    const hasSizingForAllColumns = columnsOptions.every((column) => {
      return columnSizingMap[column.id] != null;
    });

    if (!hasSizingForAllColumns) {
      applyMeasuredColumnWidths(controlledColumnSizingMap);
    }
  }, [
    columnsOptions,
    columnSizingMap,
    controlledColumnSizingMap,
    applyMeasuredColumnWidths,
  ]);

  // Ensure grid meets minimum width by expanding columns if needed
  useExpandColumnsToMinGridWidth({
    minGridWidth,
    columnSizingMap,
    setColumnSizingMap,
    fixedWidthColumnIds,
  });

  return {
    table,
    theme,
    gridRef,
    virtualGrid,
    measureRoot,
    columnsReordering,
    selection,
    enableRowVirtualization,
    getTotalHeight,
    getVisibleRows,
    enablePagination,
    sorting,
  };
};

import {
  type ColumnSizingState,
  type PaginationState,
  type Row,
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
  DATASET_INDEX_ATTRIBUTE_NAME,
  MIN_COLUMN_WIDTH,
  ROW_HEIGHT,
  TRUNCATE_LONG_CELL_WIDTH,
  VIRTUAL_INDEX_ATTRIBUTE_NAME,
} from "metabase/data-grid/constants";
import { useBodyCellMeasure } from "metabase/data-grid/hooks/use-body-cell-measure";
import { useColumnResizeObserver } from "metabase/data-grid/hooks/use-column-resize-observer";
import { useColumnsReordering } from "metabase/data-grid/hooks/use-columns-reordering";
import { useMeasureColumnWidths } from "metabase/data-grid/hooks/use-measure-column-widths";
import { useRowSizing } from "metabase/data-grid/hooks/use-row-sizing";
import { useVirtualGrid } from "metabase/data-grid/hooks/use-virtual-grid";
import type {
  DataGridColumnType,
  DataGridInstance,
  DataGridOptions,
  DataGridRowType,
  ExpandedColumnsState,
  ScrollToDestinations,
} from "metabase/data-grid/types";
import { getDataColumn } from "metabase/data-grid/utils/columns/data-column";
import { getRowIdColumn } from "metabase/data-grid/utils/columns/row-id-column";
import { getScrollBarSize } from "metabase/utils/dom";
import { isNotNull } from "metabase/utils/types";

import { getTruncatedColumnSizing } from "../utils/column-sizing";
import { maybeExpandColumnWidths } from "../utils/maybe-expand-column-widths";

import { useCellSelection } from "./use-cell-selection";
import { useColumnPinningByCount } from "./use-column-pinning-by-count";
import { useExpandColumnsToMinGridWidth } from "./use-expand-columns-to-min-grid-width";
import { useRowPinningByCount } from "./use-row-pinning-by-count";

// Disable pagination by setting pageSize to -1
const DISABLED_PAGINATION_STATE = { pageSize: -1, pageIndex: 0 };

const getColumnOrder = (
  dataColumnsOrder: string[],
  utilityColumnIds: string[],
) => _.uniq([...utilityColumnIds, ...dataColumnsOrder]);

/**
 * Main hook for creating and managing a data grid instance.
 * Handles virtualization, column sizing/reordering, cell selection,
 * pagination, and row selection.
 */
export const useDataGridInstance = <TData, TValue>({
  data,
  columnOrder: controlledColumnOrder,
  columnSizingMap: controlledColumnSizingMap,
  pinnedLeftColumnsCount = 0,
  pinnedTopRowsCount = 0,
  sorting,
  defaultRowHeight = ROW_HEIGHT,
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
  const datasetIndexAttributeName = DATASET_INDEX_ATTRIBUTE_NAME;
  const virtualIndexAttributeName = VIRTUAL_INDEX_ATTRIBUTE_NAME;
  const gridRef = useRef<HTMLDivElement>(null);

  const utilityColumns = useMemo(
    () =>
      [
        columnRowSelectOptions,
        rowId ? getRowIdColumn<TData, TValue>(rowId) : null,
      ].filter(isNotNull),
    [rowId, columnRowSelectOptions],
  );

  const utilityColumnIds = useMemo(
    () => utilityColumns.map((column) => column.id).filter(isNotNull),
    [utilityColumns],
  );

  // Initialize column order (either controlled or from column options)
  const [columnOrder, setColumnOrder] = useState<string[]>(
    getColumnOrder(
      controlledColumnOrder ?? columnsOptions.map((column) => column.id),
      utilityColumnIds,
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
    setColumnOrder(
      getColumnOrder(controlledColumnOrder ?? [], utilityColumnIds),
    );
  }, [controlledColumnOrder, utilityColumnIds]);

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

  const dataColumns = useMemo(
    () =>
      columnsOptions.map((options) =>
        getDataColumn<TData, TValue>(
          options,
          columnSizingMap,
          measuredColumnSizingMap,
          expandedColumnsMap,
          truncateLongCellWidth,
          handleExpandButtonClick,
        ),
      ),
    [
      columnsOptions,
      columnSizingMap,
      measuredColumnSizingMap,
      expandedColumnsMap,
      truncateLongCellWidth,
      handleExpandButtonClick,
    ],
  );

  const columns = useMemo(
    () => [...utilityColumns, ...dataColumns],
    [utilityColumns, dataColumns],
  );

  const fixedWidthColumnIds = utilityColumnIds;

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

  const { columnPinning, toggle: toggleColumnPinningLimiter } =
    useColumnPinningByCount({
      gridRef,
      columnOrder,
      columnSizingMap,
      pinnedColumnsCount: pinnedLeftColumnsCount + utilityColumns.length,
    });

  const { getRowHeight } = useRowSizing({
    data,
    defaultRowHeight,
    columnSizingMap,
    wrappedColumnsOptions,
    measureBodyCellDimensions,
  });

  const [sortedRows, setSortedRows] = useState<Row<TData>[]>([]);

  const rowPinning = useRowPinningByCount({
    top: pinnedTopRowsCount,
    sortedRows,
    gridRef,
    getRowHeight,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing: columnSizingMap,
      columnOrder,
      columnPinning,
      rowPinning,
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

  // Enable row virtualization only when pagination is disabled
  const enableRowVirtualization = !enablePagination;
  const virtualGrid = useVirtualGrid({
    gridRef,
    table,
    defaultRowHeight,
    enableRowVirtualization,
    getRowHeight,
    datasetIndexAttributeName,
    virtualIndexAttributeName,
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

  // For pinning row state we need to work with client-side sorted data
  useLayoutEffect(() => {
    setSortedRows(table.getSortedRowModel().rows);
  }, [sorting, data, table]);

  const { measureGrid, columnVirtualizer } = virtualGrid;
  const prevColumnSizing = useRef<ColumnSizingState>();
  const prevWrappedColumns = useRef<string[]>();

  useEffect(() => {
    const didColumnSizingChange =
      prevColumnSizing.current != null &&
      !_.isEqual(prevColumnSizing.current, columnSizingMap);

    const wrappedColumnIds = wrappedColumnsOptions.map((column) => column.id);
    const didColumnWrappingChange =
      prevWrappedColumns.current != null &&
      !_.isEqual(wrappedColumnIds, prevWrappedColumns.current);

    if (didColumnSizingChange || didColumnWrappingChange) {
      measureGrid();
    }

    prevColumnSizing.current = columnSizingMap;
    prevWrappedColumns.current = wrappedColumnIds;
  }, [columnSizingMap, measureGrid, wrappedColumnsOptions]);

  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer, columnOrder]);

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

  const isResizingColumn = !!table.getState().columnSizingInfo.isResizingColumn;
  const isInteracting = columnsReordering.isDragging || isResizingColumn;
  useEffect(() => {
    toggleColumnPinningLimiter(isInteracting);
  }, [toggleColumnPinningLimiter, isInteracting]);

  const scrollTo = useCallback(
    ({ row, column }: ScrollToDestinations) => {
      if (row) {
        const rowPinningCount = rowPinning.top?.length ?? 0;
        const rowIndex = Math.max(row.index - rowPinningCount, 0);
        virtualGrid.rowVirtualizer.scrollToIndex(rowIndex, row.options);
      }
      if (column) {
        const columnPinningCount = columnPinning.left?.length ?? 0;
        const columnIndex = Math.max(column.index - columnPinningCount, 0);
        virtualGrid.columnVirtualizer.scrollToIndex(
          columnIndex,
          column.options,
        );
      }
    },
    [virtualGrid, rowPinning, columnPinning],
  );

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

  const getPinnedRows = useCallback(
    (): DataGridRowType<TData>[] =>
      table.getTopRows().map((row, index) => ({
        origin: row,
        displayIndex: index,
        height: getRowHeight(index),
      })),
    [table, getRowHeight],
  );

  const getCenterRows = useCallback((): DataGridRowType<TData>[] => {
    const centerRows = table.getCenterRows();
    const pinnedRowsCount = table.getTopRows().length;
    if (!enableRowVirtualization) {
      return centerRows.map((row, index) => ({
        origin: row,
        displayIndex: index + pinnedRowsCount,
        height: getRowHeight(row.index),
      }));
    }
    return virtualGrid.virtualRows.map((virtualRow) => ({
      origin: centerRows[virtualRow.index],
      virtualItem: virtualRow,
      displayIndex: virtualRow.index + pinnedRowsCount,
      height: virtualRow.size,
    }));
  }, [enableRowVirtualization, getRowHeight, table, virtualGrid.virtualRows]);

  const getPinnedColumns = useCallback(
    (): DataGridColumnType<TData>[] =>
      table.getLeftVisibleLeafColumns().map((column) => ({
        origin: column,
        getCell: (row) => row.getLeftVisibleCells()[column.getIndex("left")],
      })),
    [table],
  );

  const getCenterColumns = useCallback((): DataGridColumnType<TData>[] => {
    const centerColumns = table.getCenterLeafColumns();
    return virtualGrid.virtualColumns.map((virtualColumn) => {
      return {
        origin: centerColumns[virtualColumn.index],
        virtualItem: virtualColumn,
        getCell: (row) => row.getCenterVisibleCells()[virtualColumn.index],
      };
    });
  }, [table, virtualGrid.virtualColumns]);

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
    getCenterRows,
    getCenterColumns,
    getPinnedColumns,
    getPinnedRows,
    rowMeasureRef: virtualGrid.rowMeasureRef,
    datasetIndexAttributeName,
    enablePagination,
    sorting,
    scrollTo,
  };
};

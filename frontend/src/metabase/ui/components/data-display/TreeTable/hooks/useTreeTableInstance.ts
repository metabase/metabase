import type { ExpandedState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_OVERSCAN, DEFAULT_ROW_HEIGHT } from "../constants";
import type {
  TreeNodeData,
  TreeTableInstance,
  UseTreeTableInstanceOptions,
} from "../types";

import { useColumnSizing } from "./useColumnSizing";
import { useTreeTableKeyboard } from "./useTreeTableKeyboard";

export function useTreeTableInstance<TData extends TreeNodeData>(
  options: UseTreeTableInstanceOptions<TData>,
): TreeTableInstance<TData> {
  const {
    data,
    columns,
    getNodeId,
    getSubRows,
    getRowCanExpand,
    expanded: controlledExpanded,
    onExpandedChange,
    defaultExpanded,
    autoExpandSingleChild = false,
    enableRowSelection = false,
    enableMultiRowSelection = true,
    enableSubRowSelection = false,
    rowSelection: controlledRowSelection,
    onRowSelectionChange,
    enableSorting = true,
    enableRowPinning = false,
    sorting: controlledSorting,
    onSortingChange,
    manualSorting = false,
    globalFilter: controlledGlobalFilter,
    onGlobalFilterChange,
    globalFilterFn,
    isFilterable,
    defaultRowHeight = DEFAULT_ROW_HEIGHT,
    overscan = DEFAULT_OVERSCAN,
    onRowActivate,
    selectedRowId,
    initialState,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);

  const [internalExpanded, setInternalExpanded] = useState<ExpandedState>(
    () => {
      if (defaultExpanded === true) {
        return true;
      }
      if (defaultExpanded) {
        return defaultExpanded;
      }
      if (autoExpandSingleChild && data.length === 1) {
        const nodeId = getNodeId(data[0]);
        return { [nodeId]: true };
      }
      return {};
    },
  );

  const [internalRowSelection, setInternalRowSelection] = useState<
    Record<string, boolean>
  >({});
  const [internalSorting, setInternalSorting] = useState(
    controlledSorting ?? [],
  );
  const [internalGlobalFilter, setInternalGlobalFilter] = useState(
    controlledGlobalFilter ?? "",
  );

  const expanded = controlledExpanded ?? internalExpanded;
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const sorting = controlledSorting ?? internalSorting;
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter;

  const handleExpandedChange = useCallback(
    (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      const newValue =
        typeof updater === "function" ? updater(expanded) : updater;
      if (onExpandedChange) {
        onExpandedChange(newValue);
      } else {
        setInternalExpanded(newValue);
      }
    },
    [expanded, onExpandedChange],
  );

  useEffect(() => {
    // override expanded state if defaultExpanded changes
    setInternalExpanded((prevExpanded) => {
      if (defaultExpanded === true) {
        return true;
      }
      if (defaultExpanded) {
        return {
          ...(prevExpanded === true ? {} : prevExpanded),
          ...defaultExpanded,
        };
      }
      return prevExpanded;
    });
  }, [defaultExpanded]);

  const handleRowSelectionChange = useCallback(
    (
      updater:
        | Record<string, boolean>
        | ((old: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      const newValue =
        typeof updater === "function" ? updater(rowSelection) : updater;
      if (onRowSelectionChange) {
        onRowSelectionChange(newValue);
      } else {
        setInternalRowSelection(newValue);
      }
    },
    [rowSelection, onRowSelectionChange],
  );

  const handleSortingChange = useCallback(
    (
      updater:
        | { id: string; desc: boolean }[]
        | ((
            old: { id: string; desc: boolean }[],
          ) => { id: string; desc: boolean }[]),
    ) => {
      const newValue =
        typeof updater === "function" ? updater(sorting) : updater;
      if (onSortingChange) {
        onSortingChange(newValue);
      } else {
        setInternalSorting(newValue);
      }
    },
    [sorting, onSortingChange],
  );

  const handleGlobalFilterChange = useCallback(
    (updater: string | ((old: string) => string)) => {
      const newValue =
        typeof updater === "function" ? updater(globalFilter) : updater;
      if (onGlobalFilterChange) {
        onGlobalFilterChange(newValue);
      } else {
        setInternalGlobalFilter(newValue);
      }
    },
    [globalFilter, onGlobalFilterChange],
  );

  const effectiveFilterFn = useMemo(() => {
    if (globalFilterFn) {
      return globalFilterFn;
    }
    if (isFilterable) {
      return (
        row: { original: TData; getValue: (id: string) => unknown },
        columnId: string,
        filterValue: string,
      ) => {
        if (!isFilterable(row.original)) {
          // Return false for non-filterable nodes (collections).
          // filterFromLeafRows will include them if any children match.
          return false;
        }
        const value = row.getValue(columnId);
        return String(value ?? "")
          .toLowerCase()
          .includes(String(filterValue).toLowerCase());
      };
    }
    return "includesString" as const;
  }, [globalFilterFn, isFilterable]);

  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
      rowSelection,
      sorting,
      globalFilter,
    },
    getRowId: (row) => getNodeId(row),
    getSubRows,
    getRowCanExpand,
    onExpandedChange: handleExpandedChange,
    onRowSelectionChange: handleRowSelectionChange,
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    enableRowSelection,
    enableMultiRowSelection,
    enableSubRowSelection,
    enableSorting,
    manualSorting,
    enableRowPinning,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    filterFromLeafRows: true,
    globalFilterFn: effectiveFilterFn,
    initialState,
  });

  const rows = table.getRowModel().rows;
  const topPinnedRows = table.getTopRows();
  const centerRows = table.getCenterRows();
  const bottomPinnedRows = table.getBottomRows();

  const virtualizer = useVirtualizer({
    count: centerRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => defaultRowHeight,
    overscan,
    getItemKey: (index) => centerRows[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const columnSizing = useColumnSizing({
    columns,
    table,
  });

  const keyboard = useTreeTableKeyboard({
    table,
    virtualizer,
    topPinnedRows,
    centerRows,
    bottomPinnedRows,
    enableRowSelection: Boolean(enableRowSelection),
    onRowActivate,
  });

  const scrollToRow = useCallback(
    (
      rowId: string,
      options?: { align?: "start" | "center" | "end" | "auto" },
    ) => {
      // Only scroll to center rows - pinned rows are always visible
      const index = centerRows.findIndex((r) => r.id === rowId);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, options);
      }
    },
    [centerRows, virtualizer],
  );

  const scrollToNode = useCallback(
    (nodeId: string) => {
      scrollToRow(nodeId, { align: "auto" });
    },
    [scrollToRow],
  );

  return {
    table,
    rows,
    topPinnedRows,
    centerRows,
    bottomPinnedRows,
    virtualizer,
    containerRef,
    virtualRows,
    totalSize,
    columnWidths: columnSizing.columnWidths,
    isMeasured: columnSizing.isMeasured,
    setContainerWidth: columnSizing.setContainerWidth,
    scrollToRow,
    scrollToNode,
    activeRowId: keyboard.activeRowId,
    setActiveRowId: keyboard.setActiveRowId,
    handleKeyDown: keyboard.handleKeyDown,
    selectedRowId: selectedRowId ?? null,
  };
}

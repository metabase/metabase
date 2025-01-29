import type { Table as ReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useCallback, useLayoutEffect } from "react";
import _ from "underscore";

import type { RowValues } from "metabase-types/api";

import { ROW_HEIGHT } from "../constants";

interface UseVirtualGridProps {
  bodyRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<RowValues>;
  measureRowHeight: (rowIndex: number) => number;
}

export const useVirtualGrid = ({
  bodyRef,
  table,
  measureRowHeight,
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
    measureElement: element => {
      const rowIndexRaw = element?.getAttribute("data-index");
      const rowIndex = rowIndexRaw != null ? parseInt(rowIndexRaw, 10) : null;
      if (rowIndex == null || !isFinite(rowIndex)) {
        return ROW_HEIGHT;
      }

      return measureRowHeight(rowIndex);
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

  const measureGrid = useCallback(() => {
    Array.from(rowVirtualizer.elementsCache.values()).forEach(el =>
      rowVirtualizer.measureElement(el),
    );
    columnVirtualizer.measure();
  }, [rowVirtualizer, columnVirtualizer]);

  useLayoutEffect(() => {
    measureGrid();
  }, [measureRowHeight, measureGrid]);

  return {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
    measureGrid,
  };
};

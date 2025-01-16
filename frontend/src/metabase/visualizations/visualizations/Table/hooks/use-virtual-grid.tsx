import type { Table as ReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useMemo } from "react";

import type { DatasetData, RowValue, RowValues } from "metabase-types/api";

import { ROW_HEIGHT } from "../constants";

interface UseVirtualGridProps {
  bodyRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<RowValues>;
  data: DatasetData;
  columnFormatters: ((value: RowValue) => React.ReactNode)[];
  measureBodyCellDimensions: (value: any, width: number) => { height: number };
}

export const useVirtualGrid = ({
  bodyRef,
  table,
  data,
  columns,
  columnFormatters,
  measureBodyCellDimensions,
}: UseVirtualGridProps) => {
  const wrappedColumns = useMemo(() => {
    return columns.filter(col => col.isWrapped);
  }, [columns]);

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

      if (!rowIndex || wrappedColumns.length === 0) {
        return ROW_HEIGHT;
      }

      const height = Math.max(
        ...wrappedColumns.map(column => {
          const value = data.rows[parseInt(rowIndex, 10)][column.datasetIndex];
          const formattedValue = columnFormatters[column.datasetIndex](value);
          return measureBodyCellDimensions(formattedValue, column.size).height;
        }, ROW_HEIGHT),
      );

      return height;
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

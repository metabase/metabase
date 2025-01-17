import type { Table as ReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useMemo } from "react";

import type { DatasetData, RowValue, RowValues } from "metabase-types/api";

import { ROW_HEIGHT } from "../constants";

import type { CellMeasurer } from "./use-cell-measure";

interface PivotedDatasetData extends DatasetData {
  sourceRows: RowValues[];
}

interface UseVirtualGridProps {
  bodyRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<RowValues>;
  columns: any[];
  data: DatasetData | PivotedDatasetData;
  columnFormatters: ((value: RowValue) => React.ReactNode)[];
  measureBodyCellDimensions: CellMeasurer;
  isPivoted?: boolean;
}

export const useVirtualGrid = ({
  bodyRef,
  table,
  data,
  columns,
  columnFormatters,
  measureBodyCellDimensions,
  isPivoted = false,
}: UseVirtualGridProps) => {
  const wrappedColumns = useMemo(() => {
    return columns.filter(col => col.wrap);
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
          const value =
            isPivoted && "sourceRows" in data
              ? data.sourceRows[parseInt(rowIndex, 10)][column.datasetIndex]
              : data.rows[parseInt(rowIndex, 10)][column.datasetIndex];
          const formattedValue = columnFormatters[column.datasetIndex](value);
          const formattedString = formattedValue?.toString() ?? "";
          return measureBodyCellDimensions(formattedString, column.size).height;
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

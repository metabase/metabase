import { useElementSize } from "@mantine/hooks";
import { type MouseEvent, useCallback, useMemo } from "react";

import { DataGrid } from "metabase/data-grid/components/DataGrid/DataGrid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type { ColumnOptions } from "metabase/data-grid/types";
import { Box } from "metabase/ui";

import S from "./TasksTable.module.css";
import type { TablePaginationOptions, TableSortOptions } from "./types";

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 58;

export type TasksTableProps<TData, TColumn extends string> = {
  data: TData[];
  columns: ColumnOptions<TData, unknown, TColumn>[];
  sortOptions?: TableSortOptions<TColumn>;
  paginationOptions?: TablePaginationOptions;
  onSortChange?: (sortColumn: TColumn) => void;
  onPageChange?: (pageIndex: number) => void;
};

export function TasksTable<TData, TColumn extends string>({
  data,
  columns,
  sortOptions,
  paginationOptions,
  onSortChange,
  onPageChange,
}: TasksTableProps<TData, TColumn>) {
  const { ref: containerRef, width: containerWidth } = useElementSize();

  const theme = useMemo(
    () => ({ fontSize: "14px", headerHeight: HEADER_HEIGHT }),
    [],
  );

  const columnsWithSort = useMemo(() => {
    return columns.map((col) => {
      if (col.id === sortOptions?.column) {
        return { ...col, sortDirection: sortOptions.direction };
      }
      return col;
    });
  }, [columns, sortOptions]);

  const tableProps = useDataGridInstance({
    data,
    columnsOptions: columnsWithSort,
    defaultRowHeight: ROW_HEIGHT,
    theme,
    minGridWidth: containerWidth || undefined,
    pageIndex: paginationOptions?.pageIndex,
    pageSize: paginationOptions?.pageSize,
    total: paginationOptions?.total,
    onPageChange,
  });

  const handleHeaderCellClick = useCallback(
    (_event: MouseEvent<HTMLDivElement>, columnId?: string) => {
      const column = columns.find((col) => col.id === columnId);
      if (column != null) {
        onSortChange?.(column.id);
      }
    },
    [columns, onSortChange],
  );

  return (
    <Box
      ref={containerRef}
      h="100%"
      pos="relative"
      bd="1px solid var(--mb-color-border)"
      className={S.tableContainer}
    >
      {containerWidth > 0 ? (
        <DataGrid {...tableProps} onHeaderCellClick={handleHeaderCellClick} />
      ) : null}
    </Box>
  );
}

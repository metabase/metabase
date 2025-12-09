import { useElementSize } from "@mantine/hooks";
import { type MouseEvent, useCallback, useMemo } from "react";

import { DataGrid } from "metabase/data-grid/components/DataGrid/DataGrid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import { Box, Flex, Loader } from "metabase/ui";

import S from "./TasksTable.module.css";
import type { TableColumnOptions, TableSortDirection } from "./types";

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 58;

export type TasksTableProps<TData, TColumn extends string> = {
  data: TData[];
  columns: TableColumnOptions<TData, TColumn>[];
  sortColumn?: TColumn;
  sortDirection?: TableSortDirection;
  pageIndex?: number;
  pageSize?: number;
  pageTotal?: number;
  isFetching?: boolean;
  onSortChange?: (sorTColumn: TColumn) => void;
  onPageChange?: (pageIndex: number) => void;
};

export function TasksTable<TData, TColumn extends string>({
  data,
  columns,
  sortColumn,
  sortDirection,
  pageIndex,
  pageSize,
  pageTotal,
  isFetching,
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
      if (col.id === sortColumn) {
        return { ...col, sortDirection };
      }
      return col;
    });
  }, [columns, sortColumn, sortDirection]);

  const tableProps = useDataGridInstance({
    data,
    columnsOptions: columnsWithSort,
    defaultRowHeight: ROW_HEIGHT,
    theme,
    minGridWidth: containerWidth || undefined,
    pageIndex,
    pageSize,
    total: pageTotal,
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
      {isFetching && (
        <Flex
          pos="absolute"
          inset={0}
          align="center"
          justify="center"
          bg="color-mix(in srgb, var(--mb-color-bg-white) 60%, transparent)"
        >
          <Loader size="lg" />
        </Flex>
      )}
    </Box>
  );
}

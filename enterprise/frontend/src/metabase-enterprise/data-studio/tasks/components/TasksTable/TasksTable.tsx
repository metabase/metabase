import { useElementSize } from "@mantine/hooks";
import type React from "react";
import { useCallback, useMemo } from "react";

import { DataGrid } from "metabase/data-grid/components/DataGrid/DataGrid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type { ColumnOptions } from "metabase/data-grid/types";
import { Box, Flex, Loader } from "metabase/ui";

import S from "./TasksTable.module.css";

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 58;

export interface TasksTableProps<TData, TSortColumn extends string> {
  data: TData[];
  columns: ColumnOptions<TData, string>[];
  sortColumn?: TSortColumn;
  sortDirection?: "asc" | "desc";
  columnIdToSortColumn?: Partial<Record<string, TSortColumn>>;
  onSortChange?: (column: TSortColumn) => void;
  pagination?: {
    total: number;
    pageIndex: number;
    pageSize: number;
    onPageChange: (pageIndex: number) => void;
  };
  isFetching?: boolean;
}

export function TasksTable<TData, TSortColumn extends string>({
  data,
  columns,
  sortColumn,
  sortDirection,
  columnIdToSortColumn,
  onSortChange,
  pagination,
  isFetching,
}: TasksTableProps<TData, TSortColumn>) {
  const { ref: containerRef, width: containerWidth } = useElementSize();

  const theme = useMemo(
    () => ({ fontSize: "14px", headerHeight: HEADER_HEIGHT }),
    [],
  );

  const columnsWithSort = useMemo(() => {
    if (!columnIdToSortColumn || !sortColumn) {
      return columns;
    }
    return columns.map((col) => {
      const apiColumn = columnIdToSortColumn[col.id];
      if (apiColumn && apiColumn === sortColumn) {
        return { ...col, sortDirection };
      }
      return col;
    });
  }, [columns, columnIdToSortColumn, sortColumn, sortDirection]);

  const tableProps = useDataGridInstance({
    data,
    columnsOptions: columnsWithSort,
    defaultRowHeight: ROW_HEIGHT,
    theme,
    minGridWidth: containerWidth || undefined,
    pageSize: pagination?.pageSize,
    total: pagination?.total,
    pageIndex: pagination?.pageIndex,
    onPageChange: pagination?.onPageChange,
  });

  const handleHeaderCellClick = useCallback(
    (_event: React.MouseEvent<HTMLDivElement>, columnId?: string) => {
      if (!columnId || !onSortChange || !columnIdToSortColumn) {
        return;
      }
      const apiColumn = columnIdToSortColumn[columnId];
      if (apiColumn) {
        onSortChange(apiColumn);
      }
    },
    [onSortChange, columnIdToSortColumn],
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

import { memo, useMemo } from "react";

import type {
  UnreferencedItem,
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import { TasksTable } from "../../../components/TasksTable";

import { getColumns } from "./utils";

type UnreferencedItemsTableProps = {
  items: UnreferencedItem[];
  sortColumn?: UnreferencedItemSortColumn;
  sortDirection?: UnreferencedItemSortDirection;
  pageIndex?: number;
  pageSize?: number;
  pageTotal?: number;
  isFetching?: boolean;
  onSortChange?: (columnId: UnreferencedItemSortColumn) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const UnreferencedItemsTable = memo(function UnreferencedItemsTable({
  items,
  sortColumn,
  sortDirection,
  pageIndex,
  pageSize,
  pageTotal,
  isFetching,
  onSortChange,
  onPageChange,
}: UnreferencedItemsTableProps) {
  const columns = useMemo(() => getColumns(), []);

  return (
    <TasksTable
      data={items}
      columns={columns}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      pageIndex={pageIndex}
      pageSize={pageSize}
      pageTotal={pageTotal}
      isFetching={isFetching}
      onSortChange={onSortChange}
      onPageChange={onPageChange}
    />
  );
});

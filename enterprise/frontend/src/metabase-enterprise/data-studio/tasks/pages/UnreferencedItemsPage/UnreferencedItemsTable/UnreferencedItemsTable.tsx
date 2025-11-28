import { useMemo } from "react";

import type {
  UnreferencedItem,
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import type { EntityTypeFilterValue } from "../../../components/TasksFilterButton";
import { TasksTable } from "../../../components/TasksTable";

import { getColumnIdToSortColumn, getColumnsForEntityType } from "./columns";

interface UnreferencedItemsTableProps {
  items: UnreferencedItem[];
  entityType: EntityTypeFilterValue;
  sortColumn?: UnreferencedItemSortColumn;
  sortDirection?: UnreferencedItemSortDirection;
  onSortChange?: (column: UnreferencedItemSortColumn) => void;
  pagination?: {
    total: number;
    pageIndex: number;
    pageSize: number;
    onPageChange: (pageIndex: number) => void;
  };
  isFetching?: boolean;
}

export function UnreferencedItemsTable({
  items,
  entityType,
  sortColumn,
  sortDirection,
  onSortChange,
  pagination,
  isFetching,
}: UnreferencedItemsTableProps) {
  const columns = useMemo(
    () => getColumnsForEntityType(entityType),
    [entityType],
  );

  const columnIdToSortColumn = useMemo(
    () => getColumnIdToSortColumn(entityType),
    [entityType],
  );

  return (
    <TasksTable
      data={items}
      columns={columns}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      columnIdToSortColumn={columnIdToSortColumn}
      onSortChange={onSortChange}
      pagination={pagination}
      isFetching={isFetching}
    />
  );
}

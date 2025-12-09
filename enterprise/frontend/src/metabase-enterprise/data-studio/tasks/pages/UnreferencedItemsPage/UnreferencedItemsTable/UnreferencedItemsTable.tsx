import { memo, useCallback, useMemo } from "react";

import type { UnreferencedItem } from "metabase-types/api";

import { TasksTable } from "../../../components/TasksTable";
import type {
  UnreferencedItemsPaginationOptions,
  UnreferencedItemsSortOptions,
} from "../types";

import type { UnreferencedItemColumn } from "./types";
import { getColumns, isSortableColumn } from "./utils";

type UnreferencedItemsTableProps = {
  items: UnreferencedItem[];
  sortOptions?: UnreferencedItemsSortOptions;
  paginationOptions?: UnreferencedItemsPaginationOptions;
  onSortChange?: (sortOptions: UnreferencedItemsSortOptions) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const UnreferencedItemsTable = memo(function UnreferencedItemsTable({
  items,
  sortOptions,
  paginationOptions,
  onSortChange,
  onPageChange,
}: UnreferencedItemsTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const handleSortChange = useCallback(
    (newSortColumn: UnreferencedItemColumn) => {
      if (isSortableColumn(newSortColumn)) {
        const newSortDirection =
          sortOptions?.column === newSortColumn &&
          sortOptions?.direction === "asc"
            ? "desc"
            : "asc";
        onSortChange?.({
          column: newSortColumn,
          direction: newSortDirection,
        });
      }
    },
    [sortOptions, onSortChange],
  );

  return (
    <TasksTable
      data={items}
      columns={columns}
      sortOptions={sortOptions}
      paginationOptions={paginationOptions}
      onSortChange={handleSortChange}
      onPageChange={onPageChange}
    />
  );
});

import { memo, useCallback, useMemo } from "react";

import type {
  DependencyListSortOptions,
  PaginationOptions,
} from "metabase-enterprise/dependencies/types";
import type { DependencyNode } from "metabase-types/api";

import { EntityTable } from "./EntityTable";
import type { DependencyColumn } from "./types";
import { getColumns, isSortableColumn } from "./utils";

type DependencyListProps = {
  items: DependencyNode[];
  sortOptions?: DependencyListSortOptions;
  paginationOptions?: PaginationOptions;
  withDependentsCountColumn?: boolean;
  onSortChange?: (sortOptions: DependencyListSortOptions) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const DependencyList = memo(function DependencyList({
  items,
  sortOptions,
  paginationOptions,
  withDependentsCountColumn = false,
  onSortChange,
  onPageChange,
}: DependencyListProps) {
  const columns = useMemo(
    () => getColumns({ withDependentsCountColumn }),
    [withDependentsCountColumn],
  );

  const handleSortChange = useCallback(
    (newSortColumn: DependencyColumn) => {
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
    <EntityTable
      data={items}
      columns={columns}
      sortOptions={sortOptions}
      paginationOptions={paginationOptions}
      onSortChange={handleSortChange}
      onPageChange={onPageChange}
    />
  );
});

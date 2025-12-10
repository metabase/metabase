import { memo, useCallback, useMemo } from "react";

import type {
  DependencyListSortOptions,
  PaginationOptions,
} from "metabase-enterprise/dependencies/types";
import type { DependencyNode } from "metabase-types/api";

import { DependencyList } from "../../../components/DependencyList";

import type { DependencyColumn } from "./types";
import { getColumns, isSortableColumn } from "./utils";

type BrokenDependencyListProps = {
  items: DependencyNode[];
  sortOptions?: DependencyListSortOptions;
  paginationOptions?: PaginationOptions;
  onSortChange?: (sortOptions: DependencyListSortOptions) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const BrokenDependencyList = memo(function BrokenDependencyList({
  items,
  sortOptions,
  paginationOptions,
  onSortChange,
  onPageChange,
}: BrokenDependencyListProps) {
  const columns = useMemo(() => getColumns(), []);

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
    <DependencyList
      data={items}
      columns={columns}
      sortOptions={sortOptions}
      paginationOptions={paginationOptions}
      onSortChange={handleSortChange}
      onPageChange={onPageChange}
    />
  );
});

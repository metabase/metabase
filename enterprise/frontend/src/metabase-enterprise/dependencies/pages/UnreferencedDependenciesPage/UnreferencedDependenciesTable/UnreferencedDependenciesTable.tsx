import { memo, useCallback, useMemo } from "react";

import type { DependencyNode } from "metabase-types/api";

import { DependenciesTable } from "../../../components/DependenciesTable";
import type { TablePaginationOptions } from "../../../types";
import type { UnreferencedDependenciesSortOptions } from "../types";

import type { DependencyColumn } from "./types";
import { getColumns, isSortableColumn } from "./utils";

type UnreferencedDependenciesTable = {
  items: DependencyNode[];
  sortOptions?: UnreferencedDependenciesSortOptions;
  paginationOptions?: TablePaginationOptions;
  onSortChange?: (sortOptions: UnreferencedDependenciesSortOptions) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const UnreferencedDependenciesTable = memo(
  function UnreferencedDependenciesTable({
    items,
    sortOptions,
    paginationOptions,
    onSortChange,
    onPageChange,
  }: UnreferencedDependenciesTable) {
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
      <DependenciesTable
        data={items}
        columns={columns}
        sortOptions={sortOptions}
        paginationOptions={paginationOptions}
        onSortChange={handleSortChange}
        onPageChange={onPageChange}
      />
    );
  },
);

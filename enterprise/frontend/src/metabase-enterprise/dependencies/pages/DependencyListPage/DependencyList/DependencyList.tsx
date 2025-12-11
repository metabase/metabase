import { memo, useMemo } from "react";

import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import type {
  DependencyListSortOptions,
  PaginationOptions,
} from "metabase-enterprise/dependencies/types";
import type { DependencyNode } from "metabase-types/api";

import { getColumns } from "./utils";

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
  withDependentsCountColumn = false,
}: DependencyListProps) {
  const columns = useMemo(
    () => getColumns({ withDependentsCountColumn }),
    [withDependentsCountColumn],
  );

  return <Table data={items} columns={columns} />;
});

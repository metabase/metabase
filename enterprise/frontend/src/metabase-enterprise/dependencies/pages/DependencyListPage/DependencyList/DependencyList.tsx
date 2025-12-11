import { memo, useMemo } from "react";

import { Card } from "metabase/ui";
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
  withErrorsColumn: boolean;
  withDependentsCountColumn: boolean;
  onSortChange?: (sortOptions: DependencyListSortOptions) => void;
  onPageChange?: (pageIndex: number) => void;
};

export const DependencyList = memo(function DependencyList({
  items,
  withErrorsColumn,
  withDependentsCountColumn,
}: DependencyListProps) {
  const columns = useMemo(
    () => getColumns({ withErrorsColumn, withDependentsCountColumn }),
    [withErrorsColumn, withDependentsCountColumn],
  );

  return (
    <Card withBorder p={0}>
      <Table data={items} columns={columns} />
    </Card>
  );
});

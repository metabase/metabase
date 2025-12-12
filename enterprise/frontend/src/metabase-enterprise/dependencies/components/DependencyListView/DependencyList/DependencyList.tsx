import { memo, useMemo } from "react";

import { Card } from "metabase/ui";
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import type { DependencyNode } from "metabase-types/api";

import { getColumns } from "./utils";

type DependencyListProps = {
  nodes: DependencyNode[];
  withErrorsColumn: boolean;
  withDependentsCountColumn: boolean;
};

export const DependencyList = memo(function DependencyList({
  nodes,
  withErrorsColumn,
  withDependentsCountColumn,
}: DependencyListProps) {
  const columns = useMemo(
    () => getColumns({ withErrorsColumn, withDependentsCountColumn }),
    [withErrorsColumn, withDependentsCountColumn],
  );

  return (
    <Card withBorder p={0}>
      <Table data={nodes} columns={columns} />
    </Card>
  );
});

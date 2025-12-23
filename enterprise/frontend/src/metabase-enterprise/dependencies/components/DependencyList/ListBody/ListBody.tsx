import { memo, useMemo } from "react";

import { Card } from "metabase/ui";
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import type { DependencyNode } from "metabase-types/api";

import { getColumns } from "./utils";

type ListBodyProps = {
  nodes: DependencyNode[];
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
  onSelect: (node: DependencyNode) => void;
};

export const ListBody = memo(function ListBody({
  nodes,
  withErrorsColumn = false,
  withDependentsCountColumn = false,
  onSelect,
}: ListBodyProps) {
  const columns = useMemo(
    () => getColumns({ withErrorsColumn, withDependentsCountColumn }),
    [withErrorsColumn, withDependentsCountColumn],
  );

  return (
    <Card flex={1} mih={0} p={0} withBorder data-testid="dependency-list">
      <Table data={nodes} columns={columns} onSelect={onSelect} />
    </Card>
  );
});

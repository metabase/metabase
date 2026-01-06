import type { Row } from "@tanstack/react-table";
import { memo, useCallback, useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeId } from "../../../utils";

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

  const handleRowActivate = useCallback(
    (row: Row<DependencyNode>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<DependencyNode>({
    data: nodes,
    columns,
    getNodeId: (node) => getNodeId(node.id, node.type),
    onRowActivate: handleRowActivate,
  });

  return (
    <Card flex={1} mih={0} p={0} withBorder data-testid="dependency-list">
      <TreeTable instance={treeTableInstance} onRowClick={handleRowActivate} />
    </Card>
  );
});

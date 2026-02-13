import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import {
  getLocationColumn,
  getNameColumn,
} from "metabase-enterprise/dependencies/components/DependencyTable";
import { getNodeId } from "metabase-enterprise/dependencies/utils";
import type { DependencyNode } from "metabase-types/api";

type DependentsTableProps = {
  nodes: DependencyNode[];
};

function getColumns() {
  return [getNameColumn(), getLocationColumn()];
}

export function DependentsTable({ nodes }: DependentsTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<DependencyNode>({
    data: nodes,
    columns,
    getNodeId: (node) => getNodeId(node.id, node.type),
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

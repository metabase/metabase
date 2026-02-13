import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeId } from "../../utils";

import { getDefaultColumns } from "./utils";

type DependencyTableProps = {
  nodes: DependencyNode[];
};

export function DependencyTable({ nodes }: DependencyTableProps) {
  const columns = useMemo(() => getDefaultColumns(), []);

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

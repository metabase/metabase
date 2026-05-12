import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import { getNodeId } from "metabase-enterprise/dependencies/utils";
import type { DependencyNode } from "metabase-types/api";

import { getColumns } from "./utils";

type DependentsTableProps = {
  dependents: DependencyNode[];
};

export function DependentsTable({ dependents }: DependentsTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<DependencyNode>({
    data: dependents,
    columns,
    getNodeId: (node) => getNodeId(node.id, node.type),
  });

  return (
    <Card flex="0 1 auto" miw={0} mih={0} p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

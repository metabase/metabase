import { useMemo } from "react";

import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TableRemapping } from "metabase-types/api";

import { getColumns } from "./utils";

type TableRemappingTableProps = {
  remappings: TableRemapping[];
};

export function TableRemappingTable({ remappings }: TableRemappingTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<TableRemapping>({
    data: remappings,
    columns,
    getNodeId: (remapping) => String(remapping.id),
  });

  return <TreeTable instance={treeTableInstance} />;
}

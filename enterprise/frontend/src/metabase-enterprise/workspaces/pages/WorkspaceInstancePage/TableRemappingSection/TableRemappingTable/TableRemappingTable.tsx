import { useMemo } from "react";
import { t } from "ttag";

import { Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TableRemapping } from "metabase-types/api";

import { getColumns, getRows } from "./utils";

type TableRemappingTableProps = {
  remappings: TableRemapping[];
};

export function TableRemappingTable({ remappings }: TableRemappingTableProps) {
  const rows = useMemo(() => getRows(remappings), [remappings]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<TableRemapping>({
    data: rows,
    columns,
    getNodeId: (remapping) => String(remapping.id),
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      emptyState={
        <Text c="text-secondary">
          {t`Tables will be remapped here the first time a transform runs in this workspace for this database.`}
        </Text>
      }
    />
  );
}

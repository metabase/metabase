import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceColumnInfo } from "metabase-types/api";

import type { ColumnErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ColumnErrorTableProps = {
  columns: ReplaceSourceColumnInfo[];
};

export function ColumnErrorTable({ columns }: ColumnErrorTableProps) {
  const rows = useMemo(() => getRows(columns), [columns]);
  const tableColumns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ColumnErrorItem>({
    data: rows,
    columns: tableColumns,
    getNodeId: (item) => item.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

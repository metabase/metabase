import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceColumnCompareInfo } from "metabase-types/api";

import type { ColumnCompareErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ColumnCompareErrorTableProps = {
  columns: ReplaceSourceColumnCompareInfo[];
};

export function ColumnCompareErrorTable({
  columns,
}: ColumnCompareErrorTableProps) {
  const rows = useMemo(() => getRows(columns), [columns]);
  const tableColumns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ColumnCompareErrorItem>({
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

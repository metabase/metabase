import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceColumnMapping } from "metabase-types/api";

import type { EntityItem } from "../../types";

import type { ColumnMappingItem } from "./types";
import { getColumns, getRows } from "./utils";

type ColumnComparisonTableProps = {
  sourceItem: EntityItem | undefined;
  targetItem: EntityItem | undefined;
  columnMappings: ReplaceSourceColumnMapping[];
};

export function ColumnComparisonTable({
  sourceItem,
  targetItem,
  columnMappings,
}: ColumnComparisonTableProps) {
  const rows = useMemo(() => {
    return getRows(columnMappings);
  }, [columnMappings]);

  const columns = useMemo(() => {
    return getColumns(sourceItem, targetItem, columnMappings);
  }, [sourceItem, targetItem, columnMappings]);

  const treeTableInstance = useTreeTableInstance<ColumnMappingItem>({
    data: rows,
    columns,
    getNodeId: (item) => item.id.toString(),
  });

  return (
    <Card flex="0 1 auto" miw={0} mih={0} p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

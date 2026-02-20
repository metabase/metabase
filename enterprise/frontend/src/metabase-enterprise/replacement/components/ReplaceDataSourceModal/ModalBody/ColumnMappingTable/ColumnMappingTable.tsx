import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceColumnMapping } from "metabase-types/api";

import type { EntityInfo } from "../../types";

import type { ColumnMappingItem } from "./types";
import { getColumns, getRows } from "./utils";

type ColumnComparisonTableProps = {
  sourceInfo: EntityInfo | undefined;
  targetInfo: EntityInfo | undefined;
  columnMappings: ReplaceSourceColumnMapping[];
};

export function ColumnComparisonTable({
  sourceInfo,
  targetInfo,
  columnMappings,
}: ColumnComparisonTableProps) {
  const rows = useMemo(() => {
    return getRows(columnMappings);
  }, [columnMappings]);

  const columns = useMemo(() => {
    return getColumns(sourceInfo, targetInfo, columnMappings);
  }, [sourceInfo, targetInfo, columnMappings]);

  const treeTableInstance = useTreeTableInstance<ColumnMappingItem>({
    data: rows,
    columns,
    getNodeId: (item) => item.id.toString(),
  });

  return (
    <Card flex="0 1 auto" mih={0} miw={0} p={0} withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

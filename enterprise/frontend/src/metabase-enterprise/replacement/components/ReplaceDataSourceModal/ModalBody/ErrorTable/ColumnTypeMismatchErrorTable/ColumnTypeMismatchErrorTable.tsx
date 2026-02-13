import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ColumnTypeMismatchReplaceSourceError } from "metabase-types/api";

import type { ColumnTypeMismatchErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ColumnTypeMismatchErrorTableProps = {
  error: ColumnTypeMismatchReplaceSourceError;
};

export function ColumnTypeMismatchErrorTable({
  error,
}: ColumnTypeMismatchErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ColumnTypeMismatchErrorItem>({
    data: rows,
    columns,
    getNodeId: (item) => item.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ForeignKeyMismatchReplaceSourceError } from "metabase-types/api";

import type { ForeignKeyMismatchErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ForeignKeyMismatchErrorTableProps = {
  error: ForeignKeyMismatchReplaceSourceError;
};

export function ForeignKeyMismatchErrorTable({
  error,
}: ForeignKeyMismatchErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ForeignKeyMismatchErrorItem>({
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

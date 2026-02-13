import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ExtraPrimaryKeyReplaceSourceError } from "metabase-types/api";

import type { ExtraPrimaryKeyErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ExtraPrimaryKeyErrorTableProps = {
  error: ExtraPrimaryKeyReplaceSourceError;
};

export function ExtraPrimaryKeyErrorTable({
  error,
}: ExtraPrimaryKeyErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ExtraPrimaryKeyErrorItem>({
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

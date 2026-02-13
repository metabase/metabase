import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { MissingForeignKeyReplaceSourceError } from "metabase-types/api";

import type { MissingForeignKeyErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type MissingForeignKeyErrorTableProps = {
  error: MissingForeignKeyReplaceSourceError;
};

export function MissingForeignKeyErrorTable({
  error,
}: MissingForeignKeyErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<MissingForeignKeyErrorItem>({
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

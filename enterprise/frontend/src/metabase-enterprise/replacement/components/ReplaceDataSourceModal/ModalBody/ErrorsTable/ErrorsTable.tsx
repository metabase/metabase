import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceError } from "metabase-types/api";

import type { ErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ErrorsTableProps = {
  error: ReplaceSourceError;
};

export function ErrorsTable({ error }: ErrorsTableProps) {
  const rows = useMemo(() => getRows(error.columns), [error.columns]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ErrorItem>({
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

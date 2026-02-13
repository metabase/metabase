import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { ReplaceSourceError } from "metabase-types/api";

import type { ReplaceSourceErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ErrorTableProps = {
  error: ReplaceSourceError;
};

export function ErrorTable({ error }: ErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ReplaceSourceErrorItem>({
    data: rows,
    columns,
    getNodeId: (error) => error.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}

import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { MissingColumnReplaceSourceError } from "metabase-types/api";

import type { MissingColumnErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type MissingColumnErrorTableProps = {
  error: MissingColumnReplaceSourceError;
};

export function MissingColumnErrorTable({
  error,
}: MissingColumnErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<MissingColumnErrorItem>({
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

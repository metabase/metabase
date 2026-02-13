import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { MissingPrimaryKeyReplaceSourceError } from "metabase-types/api";

import type { MissingPrimaryKeyErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type MissingPrimaryKeyErrorTableProps = {
  error: MissingPrimaryKeyReplaceSourceError;
};

export function MissingPrimaryKeyErrorTable({
  error,
}: MissingPrimaryKeyErrorTableProps) {
  const rows = useMemo(() => getRows(error), [error]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<MissingPrimaryKeyErrorItem>({
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

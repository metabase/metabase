import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { MissingColumnReplaceSourceError } from "metabase-types/api";

import type { MissingColumnReplaceSourceErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type MissingColumnErrorTableProps = {
  errors: MissingColumnReplaceSourceError[];
};

export function MissingColumnErrorTable({
  errors,
}: MissingColumnErrorTableProps) {
  const rows = useMemo(() => getRows(errors), [errors]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance =
    useTreeTableInstance<MissingColumnReplaceSourceErrorItem>({
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

import { useMemo } from "react";
import { t } from "ttag";

import { Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { WorkspaceAccessKeyLog } from "metabase-types/api";

import { getColumns, getRows } from "./utils";

type AccessKeyLogTableProps = {
  logs: WorkspaceAccessKeyLog[];
};

export function AccessKeyLogTable({ logs }: AccessKeyLogTableProps) {
  const rows = useMemo(() => getRows(logs), [logs]);
  const columns = useMemo(() => getColumns(), []);

  const instance = useTreeTableInstance<WorkspaceAccessKeyLog>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
  });

  return (
    <TreeTable
      instance={instance}
      emptyState={
        <Text c="text-secondary">{t`No access key activity yet.`}</Text>
      }
    />
  );
}

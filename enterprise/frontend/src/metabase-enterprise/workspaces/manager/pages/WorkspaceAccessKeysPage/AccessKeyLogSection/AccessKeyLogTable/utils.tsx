import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { WorkspaceAccessKeyLog } from "metabase-types/api";

export function getAccessKeyColumn(): TreeTableColumnDef<WorkspaceAccessKeyLog> {
  return {
    id: "access_key",
    header: t`Access key`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.workspace_access_key?.name ?? t`(deleted)`,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getTimestampColumn(): TreeTableColumnDef<WorkspaceAccessKeyLog> {
  return {
    id: "timestamp",
    header: t`Timestamp`,
    minWidth: 200,
    accessorFn: (row) => row.timestamp,
    cell: ({ getValue }) => <DateTime value={String(getValue())} />,
  };
}

export function getContextColumn(): TreeTableColumnDef<WorkspaceAccessKeyLog> {
  return {
    id: "context",
    header: t`Context`,
    width: "auto",
    minWidth: 160,
    accessorFn: (row) => row.context,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getRows(
  logs: WorkspaceAccessKeyLog[],
): WorkspaceAccessKeyLog[] {
  return logs;
}

export function getColumns(): TreeTableColumnDef<WorkspaceAccessKeyLog>[] {
  return [getAccessKeyColumn(), getTimestampColumn(), getContextColumn()];
}

import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import type { DatabaseRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseTableProps = {
  workspaceDatabases: WorkspaceDatabase[];
  databases: Database[];
  onRowClick: (workspaceDatabase: WorkspaceDatabase) => void;
};

export function DatabaseTable({
  workspaceDatabases,
  databases,
  onRowClick,
}: DatabaseTableProps) {
  const rows = useMemo(
    () => getRows(workspaceDatabases, databases),
    [workspaceDatabases, databases],
  );
  const columns = useMemo(() => getColumns(), []);

  const handleRowClick = (row: Row<DatabaseRow>) => {
    onRowClick(row.original.workspaceDatabase);
  };

  const treeTableInstance = useTreeTableInstance<DatabaseRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      onRowClick={handleRowClick}
      emptyState={
        <Box p="md">
          <Text c="text-secondary">{t`No databases configured yet.`}</Text>
        </Box>
      }
    />
  );
}

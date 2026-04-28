import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Box, Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { WorkspaceDatabase } from "metabase-types/api";

import type { DatabaseRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseTableProps = {
  workspaceDatabases: WorkspaceDatabase[];
  onRowClick: (workspaceDatabase: WorkspaceDatabase) => void;
};

export function DatabaseTable({
  workspaceDatabases,
  onRowClick,
}: DatabaseTableProps) {
  const { data: databasesResponse } = useListDatabasesQuery();

  const rows = useMemo(
    () => getRows(workspaceDatabases, databasesResponse?.data ?? []),
    [workspaceDatabases, databasesResponse],
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

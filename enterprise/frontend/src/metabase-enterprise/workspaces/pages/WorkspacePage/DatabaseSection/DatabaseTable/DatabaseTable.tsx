import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import { toDatabasesById } from "../../../../utils";

import type { DatabaseRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseTableProps = {
  workspaceDatabases: WorkspaceDatabase[];
  databases: Database[];
  onEdit: (workspaceDatabase: WorkspaceDatabase) => void;
  onDelete: (workspaceDatabase: WorkspaceDatabase) => void;
};

export function DatabaseTable({
  workspaceDatabases,
  databases,
  onEdit,
  onDelete,
}: DatabaseTableProps) {
  const databasesById = useMemo(() => toDatabasesById(databases), [databases]);
  const rows = useMemo(
    () => getRows(workspaceDatabases, databasesById),
    [workspaceDatabases, databasesById],
  );
  const columns = useMemo(
    () => getColumns(onEdit, onDelete),
    [onEdit, onDelete],
  );

  const treeTableInstance = useTreeTableInstance<DatabaseRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
  });

  const handleRowClick = (row: Row<DatabaseRow>) => {
    onEdit(row.original.workspaceDatabase);
  };

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

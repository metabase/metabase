import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { getColumns } from "./columns";

type WorkspaceTableProps = {
  workspaces: Workspace[];
  selectedWorkspaceId?: WorkspaceId;
  onSelect: (workspace: Workspace) => void;
};

export function WorkspaceTable({
  workspaces,
  selectedWorkspaceId,
  onSelect,
}: WorkspaceTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const instance = useTreeTableInstance<Workspace>({
    data: workspaces,
    columns,
    getNodeId: (workspace) => String(workspace.id),
    onRowActivate: (row) => onSelect(row.original),
    selectedRowId:
      selectedWorkspaceId != null ? String(selectedWorkspaceId) : undefined,
  });

  const handleRowClick = (row: Row<Workspace>) => onSelect(row.original);

  return (
    <Card flex={1} mih={0} p={0} withBorder data-testid="workspace-list">
      <TreeTable
        instance={instance}
        emptyState={
          <Box p="xl" c="text-secondary" ta="center">
            {t`No workspaces yet.`}
          </Box>
        }
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  WorkspaceInstance,
  WorkspaceInstanceId,
} from "metabase-types/api";

import { getColumns } from "./columns";

type WorkspaceInstanceTableProps = {
  instances: WorkspaceInstance[];
  selectedInstanceId?: WorkspaceInstanceId;
  onSelect: (instance: WorkspaceInstance) => void;
};

export function WorkspaceInstanceTable({
  instances,
  selectedInstanceId,
  onSelect,
}: WorkspaceInstanceTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const instance = useTreeTableInstance<WorkspaceInstance>({
    data: instances,
    columns,
    getNodeId: (instance) => String(instance.id),
    onRowActivate: (row) => onSelect(row.original),
    selectedRowId:
      selectedInstanceId != null ? String(selectedInstanceId) : undefined,
  });

  const handleRowClick = (row: Row<WorkspaceInstance>) =>
    onSelect(row.original);

  return (
    <Card
      flex={1}
      mih={0}
      p={0}
      withBorder
      data-testid="workspace-instance-list"
    >
      <TreeTable
        instance={instance}
        emptyState={
          <Box p="xl" c="text-secondary" ta="center">
            {t`No development instances yet.`}
          </Box>
        }
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

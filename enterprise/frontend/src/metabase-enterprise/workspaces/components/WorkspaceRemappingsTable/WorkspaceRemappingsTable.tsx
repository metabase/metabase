import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceInstance,
  WorkspaceRemapping,
  WorkspaceRemappingId,
} from "metabase-types/api";

import { getColumns } from "./utils";

type WorkspaceRemappingsTableProps = {
  remappings: WorkspaceRemapping[];
  databasesById: Map<DatabaseId, Database>;
  workspaceDatabases: WorkspaceInstance["databases"];
  selectedRemappingId: WorkspaceRemappingId | undefined;
  onRemappingSelect: (remapping: WorkspaceRemapping) => void;
};

export function WorkspaceRemappingsTable({
  remappings,
  databasesById,
  workspaceDatabases,
  selectedRemappingId,
  onRemappingSelect,
}: WorkspaceRemappingsTableProps) {
  const columns = useMemo(
    () => getColumns({ databasesById, workspaceDatabases }),
    [databasesById, workspaceDatabases],
  );

  const handleRowClick = useCallback(
    (row: Row<WorkspaceRemapping>) => onRemappingSelect(row.original),
    [onRemappingSelect],
  );

  const treeTableInstance = useTreeTableInstance<WorkspaceRemapping>({
    data: remappings,
    columns,
    getNodeId: (remapping) => String(remapping.id),
    selectedRowId:
      selectedRemappingId != null ? String(selectedRemappingId) : undefined,
    onRowActivate: handleRowClick,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
      data-testid="workspace-remappings-table"
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={t`No remappings yet`} />}
        ariaLabel={t`Workspace remappings`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

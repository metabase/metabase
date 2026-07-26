import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import type { TreeTableColumnDef } from "metabase/ui";
import { Box, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { getColumns, getNodeId, getRowProps } from "./utils";

type WorkspaceTableProps = {
  workspaces: Workspace[];
};

export function WorkspaceTable({ workspaces }: WorkspaceTableProps) {
  const columns: TreeTableColumnDef<Workspace>[] = useMemo(
    () => getColumns(),
    [],
  );

  const instance = useTreeTableInstance<Workspace>({
    data: workspaces,
    columns,
    getNodeId,
    defaultRowHeight: 48,
  });

  return (
    <Box data-testid="workspace-table">
      <TreeTable
        instance={instance}
        hierarchical={false}
        headerVariant="pill"
        ariaLabel={t`Workspaces`}
        getRowProps={getRowProps}
        emptyState={<ListEmptyState label={t`No workspaces yet`} />}
      />
    </Box>
  );
}

import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import type { TreeTableColumnDef } from "metabase/ui";
import { Box, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { getColumns, getNodeId, getRowProps } from "./utils";

type WorktreeTableProps = {
  worktrees: RemoteSyncWorktree[];
};

export function WorktreeTable({ worktrees }: WorktreeTableProps) {
  const columns: TreeTableColumnDef<RemoteSyncWorktree>[] = useMemo(
    () => getColumns(),
    [],
  );

  const instance = useTreeTableInstance<RemoteSyncWorktree>({
    data: worktrees,
    columns,
    getNodeId,
    defaultRowHeight: 48,
  });

  return (
    <Box data-testid="worktree-table">
      <TreeTable
        instance={instance}
        hierarchical={false}
        headerVariant="pill"
        ariaLabel={t`Worktrees`}
        getRowProps={getRowProps}
        emptyState={<ListEmptyState label={t`No worktrees yet`} />}
      />
    </Box>
  );
}

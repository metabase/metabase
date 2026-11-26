import { useMemo } from "react";

import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import type { WorktreeRowActions } from "./types";
import { getColumns, getRows } from "./utils";

type WorktreeTableProps = WorktreeRowActions & {
  worktrees: RemoteSyncWorktree[];
  currentWorktreeId: RemoteSyncWorktreeId | null;
};

export function WorktreeTable({
  worktrees,
  currentWorktreeId,
  onCheckout,
  onDelete,
}: WorktreeTableProps) {
  const rows = useMemo(
    () => getRows(worktrees, currentWorktreeId),
    [worktrees, currentWorktreeId],
  );

  const columns = useMemo(
    () => getColumns({ onCheckout, onDelete }),
    [onCheckout, onDelete],
  );

  const treeTableInstance = useTreeTableInstance({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
    enableSorting: true,
  });

  return <TreeTable instance={treeTableInstance} />;
}

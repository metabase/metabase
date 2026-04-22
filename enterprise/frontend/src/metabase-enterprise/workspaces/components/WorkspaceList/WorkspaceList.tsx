import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { COLUMN_WIDTHS, getColumns } from "./utils";

type WorkspaceListProps = {
  workspaces: Workspace[];
  isLoading?: boolean;
};

export function WorkspaceList({
  workspaces,
  isLoading = false,
}: WorkspaceListProps) {
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<Workspace>({
    data: workspaces,
    columns,
    getNodeId: (workspace) => String(workspace.id),
  });

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="workspace-list">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<ListEmptyState label={t`No workspaces yet`} />}
        />
      )}
    </Card>
  );
}

import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { COLUMN_WIDTHS, getColumns } from "./utils";

type WorkspaceListProps = {
  workspaces: Workspace[];
  isFiltered?: boolean;
  isLoading?: boolean;
};

export function WorkspaceList({
  workspaces,
  isFiltered = false,
  isLoading = false,
}: WorkspaceListProps) {
  const dispatch = useDispatch();
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<Workspace>) => {
      dispatch(push(Urls.workspace(row.original.id)));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<Workspace>({
    data: workspaces,
    columns,
    getNodeId: (workspace) => String(workspace.id),
    onRowActivate: handleRowActivate,
  });

  const emptyLabel = isFiltered ? t`No workspaces found` : t`No workspaces yet`;

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="workspace-list">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<ListEmptyState label={emptyLabel} />}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
}

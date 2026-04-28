import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useDispatch } from "metabase/redux";
import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { COLUMN_WIDTHS } from "./constants";
import { getColumns, getEmptyLabel } from "./utils";

type WorkspaceListProps = {
  workspaces: Workspace[];
  filtered?: boolean;
  loading?: boolean;
};

export function WorkspaceList({
  workspaces,
  filtered = false,
  loading = false,
}: WorkspaceListProps) {
  const dispatch = useDispatch();
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<Workspace>) => {
      dispatch(push(Urls.adminWorkspace(row.original.id)));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<Workspace>({
    data: workspaces,
    columns,
    getNodeId: (workspace) => String(workspace.id),
    onRowActivate: handleRowActivate,
  });

  const emptyLabel = getEmptyLabel(filtered);

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="workspace-list">
      {loading ? (
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

import type { Row } from "@tanstack/react-table";
import { memo, useCallback, useMemo } from "react";

import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeId } from "../../../utils";
import { ListEmptyState } from "../ListEmptyState";
import type { DependencyListMode } from "../types";

import { getColumnWidths, getColumns, getNotFoundMessage } from "./utils";

type ListBodyProps = {
  nodes: DependencyNode[];
  mode: DependencyListMode;
  isLoading?: boolean;
  onSelect: (node: DependencyNode) => void;
};

export const ListBody = memo(function ListBody({
  nodes,
  mode,
  isLoading = false,
  onSelect,
}: ListBodyProps) {
  const columns = useMemo(() => getColumns(mode), [mode]);

  const handleRowActivate = useCallback(
    (row: Row<DependencyNode>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<DependencyNode>({
    data: nodes,
    columns,
    getNodeId: (node) => getNodeId(node.id, node.type),
    onRowActivate: handleRowActivate,
  });

  return (
    <Card flex={1} mih={0} p={0} withBorder data-testid="dependency-list">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={getColumnWidths(mode)} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<ListEmptyState label={getNotFoundMessage(mode)} />}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
});

import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  DependencyNode,
  DependencySortingOptions,
} from "metabase-types/api";

import { getNodeId } from "../../../utils";
import { ListEmptyState } from "../ListEmptyState";
import type { DependencyListMode } from "../types";

import {
  getColumnWidths,
  getColumns,
  getNotFoundMessage,
  getSortingOptions,
  getSortingState,
} from "./utils";

type ListBodyProps = {
  nodes: DependencyNode[];
  mode: DependencyListMode;
  sorting: DependencySortingOptions | undefined;
  isLoading?: boolean;
  onSelect: (node: DependencyNode) => void;
  onSortingChange: (sorting: DependencySortingOptions | undefined) => void;
};

export const ListBody = function ListBody({
  nodes,
  mode,
  sorting,
  isLoading = false,
  onSelect,
  onSortingChange,
}: ListBodyProps) {
  const columns = useMemo(() => getColumns(mode), [mode]);
  const sortingState = useMemo(() => getSortingState(sorting), [sorting]);

  const handleRowActivate = useCallback(
    (row: Row<DependencyNode>) => onSelect(row.original),
    [onSelect],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingChange(getSortingOptions(newSortingState));
    },
    [sortingState, onSortingChange],
  );

  const treeTableInstance = useTreeTableInstance<DependencyNode>({
    data: nodes,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (node) => getNodeId(node.id, node.type),
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
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
};

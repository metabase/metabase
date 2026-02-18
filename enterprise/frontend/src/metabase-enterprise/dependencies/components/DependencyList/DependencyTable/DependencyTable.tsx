import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { DependencySortOptions } from "../../../types";
import { getNodeId } from "../../../utils";
import { DependencyEmptyState } from "../DependencyEmptyState";
import type { DependencyListMode } from "../types";

import {
  getColumnWidths,
  getColumns,
  getNotFoundMessage,
  getSortingOptions,
  getSortingState,
} from "./utils";

type DependencyTableProps = {
  nodes: DependencyNode[];
  mode: DependencyListMode;
  sortOptions: DependencySortOptions | undefined;
  isLoading?: boolean;
  onSelect: (node: DependencyNode) => void;
  onSortOptionsChange: (sortOptions: DependencySortOptions | undefined) => void;
};

export const DependencyTable = function DependencyTable({
  nodes,
  mode,
  sortOptions,
  isLoading = false,
  onSelect,
  onSortOptionsChange,
}: DependencyTableProps) {
  const columns = useMemo(() => getColumns(mode), [mode]);
  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<DependencyNode>) => onSelect(row.original),
    [onSelect],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortOptionsChange(getSortingOptions(newSortingState));
    },
    [sortingState, onSortOptionsChange],
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
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="dependency-list"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={getColumnWidths(mode)} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<DependencyEmptyState label={getNotFoundMessage(mode)} />}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
};

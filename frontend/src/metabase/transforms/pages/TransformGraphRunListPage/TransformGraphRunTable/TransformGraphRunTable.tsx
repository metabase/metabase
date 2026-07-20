import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TransformGraphRun } from "metabase-types/api";

import type { TransformGraphRunSortOptions } from "../types";

import {
  getColumns,
  getRowKey,
  getSortingOptions,
  getSortingState,
} from "./utils";

type TransformGraphRunTableProps = {
  runs: TransformGraphRun[];
  hasFilters: boolean;
  sortOptions: TransformGraphRunSortOptions | undefined;
  onSortOptionsChange: (
    sortOptions: TransformGraphRunSortOptions | undefined,
  ) => void;
  onSelect: (run: TransformGraphRun) => void;
};

export function TransformGraphRunTable({
  runs,
  hasFilters,
  sortOptions,
  onSortOptionsChange,
  onSelect,
}: TransformGraphRunTableProps) {
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(() => getColumns(systemTimezone), [systemTimezone]);

  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const notFoundLabel = hasFilters ? t`No runs found` : t`No runs yet`;

  const handleRowClick = useCallback(
    (row: Row<TransformGraphRun>) => {
      onSelect(row.original);
    },
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

  const treeTableInstance = useTreeTableInstance<TransformGraphRun>({
    data: runs,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: getRowKey,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      style={{ overflow: "hidden" }}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={notFoundLabel} />}
        ariaLabel={t`Runs`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

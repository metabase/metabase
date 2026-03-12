import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  TransformRun,
  TransformRunId,
  TransformTag,
} from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import type { TransformRunSortOptions } from "../types";

import { getColumns, getSortingOptions, getSortingState } from "./utils";

type RunTableProps = {
  runs: TransformRun[];
  tags: TransformTag[];
  hasFilters: boolean;
  sortOptions: TransformRunSortOptions | undefined;
  onSortOptionsChange: (
    sortOptions: TransformRunSortOptions | undefined,
  ) => void;
  onSelect: (runId: TransformRunId) => void;
};

export function RunTable({
  runs,
  tags,
  hasFilters,
  sortOptions,
  onSortOptionsChange,
  onSelect,
}: RunTableProps) {
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(
    () => getColumns(tags, systemTimezone),
    [tags, systemTimezone],
  );

  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const notFoundLabel = hasFilters ? t`No runs found` : t`No runs yet`;

  const handleRowClick = useCallback(
    (row: Row<TransformRun>) => {
      onSelect(row.original.id);
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

  const treeTableInstance = useTreeTableInstance<TransformRun>({
    data: runs,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (run) => String(run.id),
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={notFoundLabel} />}
        ariaLabel={t`Transform runs`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

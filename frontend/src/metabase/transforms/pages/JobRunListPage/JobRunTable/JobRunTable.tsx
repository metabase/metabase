import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import type { TreeTableColumnDef } from "metabase/ui";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TransformBatchRun, TransformJobRunId } from "metabase-types/api";

import type { JobRunSortOptions } from "../types";

import { getColumns, getSortingOptions, getSortingState } from "./utils";

type JobRunTableProps<T extends TransformBatchRun> = {
  runs: T[];
  hasFilters: boolean;
  sortOptions: JobRunSortOptions | undefined;
  onSortOptionsChange: (sortOptions: JobRunSortOptions | undefined) => void;
  onSelect: (runId: TransformJobRunId) => void;
  // Extra columns rendered before the shared status/trigger/timing columns (e.g. the seed
  // transform and direction for DAG runs).
  leadingColumns?: TreeTableColumnDef<T>[];
  ariaLabel?: string;
};

export function JobRunTable<T extends TransformBatchRun>({
  runs,
  hasFilters,
  sortOptions,
  onSortOptionsChange,
  onSelect,
  leadingColumns,
  ariaLabel = t`Job runs`,
}: JobRunTableProps<T>) {
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(
    () => [...(leadingColumns ?? []), ...getColumns<T>(systemTimezone)],
    [systemTimezone, leadingColumns],
  );

  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const notFoundLabel = hasFilters ? t`No runs found` : t`No runs yet`;

  const handleRowClick = useCallback(
    (row: Row<T>) => {
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

  const treeTableInstance = useTreeTableInstance<T>({
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
        ariaLabel={ariaLabel}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

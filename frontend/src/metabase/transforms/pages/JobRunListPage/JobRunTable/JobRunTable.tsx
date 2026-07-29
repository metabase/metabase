import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { TransformJobRun, TransformJobRunId } from "metabase-types/api";

import type { JobRunSortOptions } from "../types";

import { getColumns, getSortingOptions, getSortingState } from "./utils";

type JobRunTableProps = {
  runs: TransformJobRun[];
  hasFilters: boolean;
  sortOptions: JobRunSortOptions | undefined;
  onSortOptionsChange: (sortOptions: JobRunSortOptions | undefined) => void;
  onSelect: (runId: TransformJobRunId) => void;
};

export function JobRunTable({
  runs,
  hasFilters,
  sortOptions,
  onSortOptionsChange,
  onSelect,
}: JobRunTableProps) {
  const systemTimezone = useSetting("system-timezone");

  const columns = useMemo(() => getColumns(systemTimezone), [systemTimezone]);

  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const notFoundLabel = hasFilters ? t`No runs found` : t`No runs yet`;

  const handleRowClick = useCallback(
    (row: Row<TransformJobRun>) => {
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

  const treeTableInstance = useTreeTableInstance<TransformJobRun>({
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
        ariaLabel={t`Job runs`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

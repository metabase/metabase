import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  TransformRun,
  TransformRunId,
  TransformTag,
} from "metabase-types/api";

import type { TransformRunSortOptions } from "../types";

import {
  DURATION_SORT_ID,
  getColumns,
  getRunDurationMs,
  getSortingOptions,
  getSortingState,
} from "./utils";

type DurationSortDirection = "asc" | "desc";

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

  // Duration is sorted client-side over the current page only — the
  // backend has no `duration` sort key. While duration sort is active the
  // server-side sort is suspended so the two never compete.
  const [durationSort, setDurationSort] =
    useState<DurationSortDirection | null>(null);

  const sortingState = useMemo<SortingState>(() => {
    if (durationSort != null) {
      return [{ id: DURATION_SORT_ID, desc: durationSort === "desc" }];
    }
    return getSortingState(sortOptions);
  }, [durationSort, sortOptions]);

  const sortedRuns = useMemo(() => {
    if (durationSort == null) {
      return runs;
    }
    const sign = durationSort === "asc" ? 1 : -1;
    return [...runs].sort((a, b) => {
      const da = getRunDurationMs(a);
      const db = getRunDurationMs(b);
      if (da == null && db == null) {
        return 0;
      }
      if (da == null) {
        return 1; // nulls last
      }
      if (db == null) {
        return -1;
      }
      return sign * (da - db);
    });
  }, [runs, durationSort]);

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
      const next = newSortingState[0];
      if (next?.id === DURATION_SORT_ID) {
        setDurationSort(next.desc ? "desc" : "asc");
        if (sortOptions != null) {
          onSortOptionsChange(undefined);
        }
        return;
      }
      setDurationSort(null);
      onSortOptionsChange(getSortingOptions(newSortingState));
    },
    [sortingState, sortOptions, onSortOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<TransformRun>({
    data: sortedRuns,
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

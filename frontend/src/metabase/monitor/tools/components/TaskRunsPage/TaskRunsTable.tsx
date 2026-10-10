import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useScrollToTop, useSortingStateChange } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import { useNavigate } from "metabase/router";
import {
  Ellipsified,
  Loader,
  LoadingOverlay,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  ListTaskRunsSortColumn,
  SortingOptions,
  TaskRun,
} from "metabase-types/api";

import { formatTaskDuration, formatTaskRunType } from "../../utils";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";

import { DEFAULT_SORTING, TASK_RUN_SORT_COLUMNS } from "./utils";

const COLUMN_WIDTHS = [0.15, 0.2, 0.2, 0.3, 0.15];

type TaskRunsTableProps = {
  /** Leave out the status column, for a table where every run has the same status. */
  hideStatus?: boolean;
  emptyLabel?: string;
  isFetching: boolean;
  isLoading: boolean;
  page: number;
  sortingOptions: SortingOptions<ListTaskRunsSortColumn>;
  taskRuns: TaskRun[];
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ListTaskRunsSortColumn>,
  ) => void;
};

export const TaskRunsTable = ({
  hideStatus = false,
  emptyLabel = t`No results`,
  isFetching,
  isLoading,
  page,
  sortingOptions,
  taskRuns,
  onSortingOptionsChange,
}: TaskRunsTableProps) => {
  const navigate = useNavigate();

  const columns = useMemo(
    () =>
      getColumns().filter((column) => !hideStatus || column.id !== "status"),
    [hideStatus],
  );
  const { sortingState, onSortingChange } = useSortingStateChange({
    sortingOptions,
    columns: TASK_RUN_SORT_COLUMNS,
    defaultSorting: DEFAULT_SORTING,
    onSortingOptionsChange,
  });

  const handleRowActivate = useCallback(
    (row: Row<TaskRun>) => {
      navigate(Urls.monitorTaskRunDetails(row.original.id));
    },
    [navigate],
  );

  const treeTableInstance = useTreeTableInstance<TaskRun>({
    data: taskRuns,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (taskRun) => String(taskRun.id),
    onRowActivate: handleRowActivate,
    onSortingChange,
  });

  useScrollToTop({
    ref: treeTableInstance.containerRef,
    keys: [page, sortingOptions],
    skip: isFetching,
  });

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid="task-runs-table">
      {isLoading ? (
        <TreeTableSkeleton
          columnWidths={hideStatus ? COLUMN_WIDTHS.slice(1) : COLUMN_WIDTHS}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={treeTableInstance}
            hierarchical={false}
            ariaLabel={t`Task runs`}
            emptyState={<MonitorEmptyState label={emptyLabel} />}
            getRowProps={() => ({ "data-testid": "task-run" })}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </MonitorTableCard>
  );
};

function getColumns(): TreeTableColumnDef<TaskRun>[] {
  return [
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 100,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.status,
      cell: ({ row }) =>
        row.original.status === "started" ? (
          <Loader size="xs" data-testid="task-run-running" />
        ) : (
          <TaskRunStatusBadge taskRun={row.original} />
        ),
    },
    {
      id: "started_at",
      header: t`Started at`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (taskRun) => taskRun.started_at,
      cell: ({ row }) => (
        <Ellipsified
          style={{ maxWidth: 180 }}
          alwaysShowTooltip
          tooltip={row.original.started_at}
        >
          <DateTime
            value={row.original.started_at}
            unit="minute"
            data-testid="started-at"
          />
        </Ellipsified>
      ),
    },
    {
      id: "run_type",
      header: t`Task`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.run_type,
      cell: ({ row }) => (
        <Text>{formatTaskRunType(row.original.run_type)}</Text>
      ),
    },
    {
      id: "entity_name",
      header: t`Entity`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 300,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.entity_name ?? "",
      cell: ({ row }) => (
        <Ellipsified style={{ maxWidth: 200 }}>
          {row.original.entity_name}
        </Ellipsified>
      ),
    },
    {
      id: "duration",
      header: t`Duration`,
      width: "auto",
      minWidth: 120,
      enableSorting: false,
      accessorFn: (taskRun) => taskRun.ended_at,
      cell: ({ row }) => (
        <Text data-testid="duration">{formatRunDuration(row.original)}</Text>
      ),
    },
  ];
}

function formatRunDuration({ started_at, ended_at }: TaskRun) {
  if (!ended_at) {
    return EMPTY_CELL_PLACEHOLDER;
  }
  return formatTaskDuration(
    new Date(ended_at).getTime() - new Date(started_at).getTime(),
  );
}

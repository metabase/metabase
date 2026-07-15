import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Card,
  Ellipsified,
  Stack,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import {
  type Sorting,
  getNextOptionalSorting,
  getSortingState,
} from "metabase/utils/sorting";
import type {
  ListTaskRunsSortColumn,
  SortingOptions,
  TaskRun,
} from "metabase-types/api";

import { formatTaskRunType, renderTaskRunCounters } from "../../utils";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";

import { DEFAULT_SORTING, TASK_RUN_SORT_COLUMNS } from "./utils";

const COLUMN_WIDTHS = [0.2, 0.2, 0.17, 0.17, 0.13, 0.13];

const toSorting = ({
  sort_column,
  sort_direction,
}: SortingOptions<ListTaskRunsSortColumn>): Sorting<ListTaskRunsSortColumn> => ({
  column: sort_column,
  direction: sort_direction,
});

const toSortingOptions = ({
  column,
  direction,
}: Sorting<ListTaskRunsSortColumn>): SortingOptions<ListTaskRunsSortColumn> => ({
  sort_column: column,
  sort_direction: direction,
});

type TaskRunsTableProps = {
  isLoading: boolean;
  sortingOptions: SortingOptions<ListTaskRunsSortColumn>;
  taskRuns: TaskRun[];
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ListTaskRunsSortColumn>,
  ) => void;
};

export const TaskRunsTable = ({
  isLoading,
  sortingOptions,
  taskRuns,
  onSortingOptionsChange,
}: TaskRunsTableProps) => {
  const dispatch = useDispatch();

  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(
    () => getSortingState(toSorting(sortingOptions)),
    [sortingOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<TaskRun>) => {
      dispatch(push(Urls.monitorTaskRunDetails(row.original.id)));
    },
    [dispatch],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingOptionsChange(
        toSortingOptions(
          getNextOptionalSorting(newSortingState, TASK_RUN_SORT_COLUMNS) ??
            toSorting(DEFAULT_SORTING),
        ),
      );
    },
    [sortingState, onSortingOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<TaskRun>({
    data: taskRuns,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (taskRun) => String(taskRun.id),
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="task-runs-table"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          ariaLabel={t`Task runs`}
          emptyState={
            <Stack p="xl" align="center">
              <Text c="text-disabled">{t`No results`}</Text>
            </Stack>
          }
          getRowProps={() => ({ "data-testid": "task-run" })}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
};

function getColumns(): TreeTableColumnDef<TaskRun>[] {
  return [
    {
      id: "run_type",
      header: t`Run Type`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.run_type,
      cell: ({ row }) => (
        <Text fw="bold">{formatTaskRunType(row.original.run_type)}</Text>
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
      id: "ended_at",
      header: t`Ended at`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.ended_at,
      cell: ({ row }) =>
        row.original.ended_at ? (
          <Ellipsified
            style={{ maxWidth: 180 }}
            tooltip={row.original.ended_at}
          >
            <DateTime
              value={row.original.ended_at}
              unit="minute"
              data-testid="ended-at"
            />
          </Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 100,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.status,
      cell: ({ row }) => <TaskRunStatusBadge taskRun={row.original} />,
    },
    {
      id: "task_count",
      header: t`Task Count`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (taskRun) => taskRun.task_count,
      cell: ({ row }) => renderTaskRunCounters(row.original),
    },
  ];
}

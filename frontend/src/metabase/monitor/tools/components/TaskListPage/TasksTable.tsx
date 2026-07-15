import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { DateTime } from "metabase/common/components/DateTime";
import { TaskStatusBadge } from "metabase/monitor/tools/components/TaskStatusBadge";
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
  Database,
  ListTasksSortColumn,
  SortingOptions,
  Task,
} from "metabase-types/api";

import { DEFAULT_SORTING, TASK_SORT_COLUMNS } from "./utils";

const COLUMN_WIDTHS = [0.25, 0.15, 0.12, 0.16, 0.16, 0.1, 0.06];

const toSorting = ({
  sort_column,
  sort_direction,
}: SortingOptions<ListTasksSortColumn>): Sorting<ListTasksSortColumn> => ({
  column: sort_column,
  direction: sort_direction,
});

const toSortingOptions = ({
  column,
  direction,
}: Sorting<ListTasksSortColumn>): SortingOptions<ListTasksSortColumn> => ({
  sort_column: column,
  sort_direction: direction,
});

interface Props {
  databases: Database[];
  isLoading: boolean;
  sortingOptions: SortingOptions<ListTasksSortColumn>;
  tasks: Task[];
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ListTasksSortColumn>,
  ) => void;
}

export const TasksTable = ({
  databases,
  isLoading,
  sortingOptions,
  tasks,
  onSortingOptionsChange,
}: Props) => {
  const dispatch = useDispatch();

  const databaseByID: Record<number, Database> = useMemo(
    () => _.indexBy(databases, "id"),
    [databases],
  );

  const columns = useMemo(() => getColumns(databaseByID), [databaseByID]);
  const sortingState = useMemo(
    () => getSortingState(toSorting(sortingOptions)),
    [sortingOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<Task>) => {
      dispatch(push(Urls.monitorTaskDetails(row.original.id)));
    },
    [dispatch],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingOptionsChange(
        toSortingOptions(
          getNextOptionalSorting(newSortingState, TASK_SORT_COLUMNS) ??
            toSorting(DEFAULT_SORTING),
        ),
      );
    },
    [sortingState, onSortingOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<Task>({
    data: tasks,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (task) => String(task.id),
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="tasks-table">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          ariaLabel={t`Tasks`}
          emptyState={
            <Stack p="xl" align="center">
              <Text c="text-disabled">{t`No results`}</Text>
            </Stack>
          }
          getRowProps={() => ({ "data-testid": "task" })}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
};

function getColumns(
  databaseByID: Record<number, Database>,
): TreeTableColumnDef<Task>[] {
  return [
    {
      id: "task",
      header: t`Task`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 230,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (task) => task.task,
      cell: ({ row }) => <Text fw="bold">{row.original.task}</Text>,
    },
    {
      id: "db_name",
      header: t`DB Name`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (task) =>
        task.db_id !== null ? (databaseByID[task.db_id]?.name ?? "") : "",
      cell: ({ row }) => {
        const { db_id } = row.original;
        // only want unknown if there is a db on the task and we don't have info
        if (db_id === null) {
          return null;
        }
        return databaseByID[db_id]?.name || t`Unknown name`;
      },
    },
    {
      id: "db_engine",
      header: t`DB Engine`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (task) =>
        task.db_id !== null ? (databaseByID[task.db_id]?.engine ?? "") : "",
      cell: ({ row }) => {
        const { db_id } = row.original;
        if (db_id === null) {
          return null;
        }
        return databaseByID[db_id]?.engine || t`Unknown engine`;
      },
    },
    {
      id: "started_at",
      header: t`Started at`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (task) => task.started_at,
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
      accessorFn: (task) => task.ended_at,
      cell: ({ row }) =>
        row.original.ended_at ? (
          <Ellipsified
            style={{ maxWidth: 180 }}
            alwaysShowTooltip
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
      id: "duration",
      header: t`Duration (ms)`,
      width: "auto",
      minWidth: 80,
      maxAutoWidth: 100,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (task) => task.duration,
      cell: ({ row }) => row.original.duration,
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 100,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (task) => task.status,
      cell: ({ row }) => <TaskStatusBadge task={row.original} />,
    },
  ];
}

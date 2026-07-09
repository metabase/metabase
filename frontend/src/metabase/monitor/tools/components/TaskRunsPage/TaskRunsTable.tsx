import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useDispatch } from "metabase/redux";
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
import type { TaskRun } from "metabase-types/api";

import { formatTaskRunType, renderTaskRunCounters } from "../../utils";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";

const COLUMN_WIDTHS = [0.2, 0.2, 0.17, 0.17, 0.13, 0.13];

type TaskRunsTableProps = {
  isLoading: boolean;
  taskRuns: TaskRun[];
};

export const TaskRunsTable = ({ isLoading, taskRuns }: TaskRunsTableProps) => {
  const dispatch = useDispatch();

  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<TaskRun>) => {
      dispatch(push(Urls.monitorTaskRunDetails(row.original.id)));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<TaskRun>({
    data: taskRuns,
    columns,
    getNodeId: (taskRun) => String(taskRun.id),
    onRowActivate: handleRowActivate,
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
      enableSorting: false,
      accessorFn: (taskRun) => taskRun.run_type,
      cell: ({ row }) => (
        <Text fw="bold">{formatTaskRunType(row.original.run_type)}</Text>
      ),
    },
    {
      id: "entity",
      header: t`Entity`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 300,
      enableSorting: false,
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
      enableSorting: false,
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
      enableSorting: false,
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
      enableSorting: false,
      accessorFn: (taskRun) => taskRun.status,
      cell: ({ row }) => <TaskRunStatusBadge taskRun={row.original} />,
    },
    {
      id: "task_count",
      header: t`Task Count`,
      width: "auto",
      minWidth: 150,
      enableSorting: false,
      accessorFn: (taskRun) => taskRun.task_count,
      cell: ({ row }) => renderTaskRunCounters(row.original),
    },
  ];
}

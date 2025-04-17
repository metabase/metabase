import type { Location } from "history";
import type { ReactNode } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery, useListTasksQuery } from "metabase/api";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import AdminHeader from "metabase/components/AdminHeader";
import { PaginationControls } from "metabase/components/PaginationControls";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";
import { SortDirection } from "metabase-types/api/sorting";

import { TaskPicker } from "../../components/TaskPicker";
import { TaskStatusPicker } from "../../components/TaskStatusPicker";

import { TasksTable } from "./TasksTable";
import type { SortColumn } from "./types";
import { urlStateConfig } from "./utils";

type TasksAppProps = {
  children: ReactNode;
  location: Location;
};

const PAGE_SIZE = 50;

const TasksAppBase = ({ children, location }: TasksAppProps) => {
  const [
    { page, sort_column, sort_direction, status, task },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const {
    data: tasksData,
    isFetching: isLoadingTasks,
    error: tasksError,
  } = useListTasksQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort_column,
    sort_direction,
    status: status ?? undefined,
    task: task ?? undefined,
  });

  const {
    data: databasesData,
    isFetching: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const tasks = tasksData?.data ?? [];
  const total = tasksData?.total ?? 0;
  const databases = databasesData?.data ?? [];
  const isLoading = isLoadingTasks || isLoadingDatabases;
  const error = tasksError || databasesError;

  const handleSort = (column: SortColumn) => {
    patchUrlState({
      sort_column: column,
      sort_direction:
        sort_direction === SortDirection.Asc
          ? SortDirection.Desc
          : SortDirection.Asc,
    });
  };

  return (
    <Box pl="md">
      <Flex align="center" gap="sm">
        <AdminHeader title={t`Troubleshooting logs`} />

        <Flex align="center" c="text-medium" flex="0 0 auto">
          <Tooltip
            label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
          >
            <Icon name="info" />
          </Tooltip>
        </Flex>
      </Flex>

      <Flex gap="md" justify="space-between" mt="md">
        <Flex gap="md">
          <TaskPicker
            value={task}
            onChange={(task) => patchUrlState({ task, page: 0 })}
          />

          <TaskStatusPicker
            value={status}
            onChange={(status) => patchUrlState({ status, page: 0 })}
          />
        </Flex>

        <PaginationControls
          onPreviousPage={() => patchUrlState({ page: page - 1 })}
          onNextPage={() => patchUrlState({ page: page + 1 })}
          page={page}
          pageSize={50}
          itemsLength={tasks.length}
          total={total}
        />
      </Flex>

      <TasksTable
        databases={databases}
        error={error}
        isLoading={isLoading}
        sortColumn={sort_column}
        sortDirection={sort_direction}
        tasks={tasks}
        onSort={handleSort}
      />

      {
        // render 'children' so that the invididual task modals show up
        children
      }
    </Box>
  );
};

export const TasksApp = withRouter(TasksAppBase);

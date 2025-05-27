import type { Location } from "history";
import type { ReactNode } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery, useListTasksQuery } from "metabase/api";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import AdminHeader from "metabase/components/AdminHeader";
import { PaginationControls } from "metabase/components/PaginationControls";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";

import { TaskPicker } from "../../components/TaskPicker";
import { TaskStatusPicker } from "../../components/TaskStatusPicker";

import { TasksTable } from "./TasksTable";
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
  const sortingOptions = { sort_column, sort_direction };

  const {
    data: tasksData,
    isLoading: isLoadingTasks,
    error: tasksError,
  } = useListTasksQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_column,
      sort_direction,
      status: status ?? undefined,
      task: task ?? undefined,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const {
    data: databasesData,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const tasks = tasksData?.data ?? [];
  const total = tasksData?.total ?? 0;
  const databases = databasesData?.data ?? [];
  const isLoading = isLoadingTasks || isLoadingDatabases;
  const error = tasksError || databasesError;

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
        sortingOptions={sortingOptions}
        tasks={tasks}
        onSortingOptionsChange={(sortingOptions) =>
          patchUrlState({ ...sortingOptions, page: 0 })
        }
      />

      {
        // render 'children' so that the invididual task modals show up
        children
      }
    </Box>
  );
};

export const TasksApp = withRouter(TasksAppBase);

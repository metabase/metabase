import type { WithRouterProps } from "react-router";

import { useListDatabasesQuery, useListTasksQuery } from "metabase/api";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { Flex } from "metabase/ui";

import { TaskPicker } from "../TaskPicker";
import { TaskStatusPicker } from "../TaskStatusPicker";
import { TasksTabs } from "../TasksTabs";

import { TasksTable } from "./TasksTable";
import { urlStateConfig } from "./utils";

const PAGE_SIZE = 50;

export const TaskListPage = ({ location }: WithRouterProps) => {
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
    <TasksTabs>
      <Flex gap="md" justify="space-between">
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
          pageSize={PAGE_SIZE}
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
    </TasksTabs>
  );
};

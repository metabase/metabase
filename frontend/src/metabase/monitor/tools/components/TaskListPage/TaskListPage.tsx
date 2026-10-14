import { useMemo } from "react";
import { t } from "ttag";

import { useLazyListTasksQuery, useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { useLocation } from "metabase/router";
import { Center, Flex, Group, Stack } from "metabase/ui";

import { TaskPicker } from "../TaskPicker";
import { TaskStatusPicker } from "../TaskStatusPicker";
import { TasksTabs } from "../TasksTabs";

import { TasksTable } from "./TasksTable";
import { urlStateConfig } from "./utils";

const PAGE_SIZE = 50;

export const TaskListPage = () => {
  const location = useLocation();
  const [
    { page, sort_column, sort_direction, status, task },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);
  const sortingOptions = useMemo(
    () => ({ sort_column, sort_direction }),
    [sort_column, sort_direction],
  );

  const {
    data: tasksData,
    isFetching: isFetchingTasks,
    isLoading: isLoadingTasks,
    error: tasksError,
  } = useAbortableQuery(
    useLazyListTasksQuery,
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
  const isFetching = isFetchingTasks || isLoadingDatabases;
  const isLoading = isLoadingTasks || isLoadingDatabases;
  const error = tasksError || databasesError;

  return (
    <Flex h="100%" wrap="nowrap">
      <MonitorMain>
        <Stack gap="xl">
          <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>
          <TasksTabs />
        </Stack>
        <Group gap="lg" align="center" wrap="nowrap">
          <TaskPicker
            value={task}
            onChange={(task) => patchUrlState({ task, page: 0 })}
          />

          <TaskStatusPicker
            value={status}
            onChange={(status) => patchUrlState({ status, page: 0 })}
          />
        </Group>

        {error !== undefined ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <TasksTable
            databases={databases}
            isFetching={isFetching}
            isLoading={isLoading}
            page={page}
            sortingOptions={sortingOptions}
            tasks={tasks}
            onSortingOptionsChange={(sortingOptions) =>
              patchUrlState({ ...sortingOptions, page: 0 })
            }
          />
        )}

        {!isLoading && !error && (
          <Flex justify="end">
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={tasks.length}
              total={total}
              showTotal
              onPreviousPage={() =>
                patchUrlState({ page: page - 1 }, { immediate: true })
              }
              onNextPage={() =>
                patchUrlState({ page: page + 1 }, { immediate: true })
              }
            />
          </Flex>
        )}
      </MonitorMain>
    </Flex>
  );
};

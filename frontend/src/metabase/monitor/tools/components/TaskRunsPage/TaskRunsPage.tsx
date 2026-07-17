import { t } from "ttag";

import { useLazyListTaskRunsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { type WithRouterProps, withRouter } from "metabase/router";
import { Center, Flex, Group } from "metabase/ui";

import { toBackendStartedAt } from "../../utils";
import { TaskRunTypePicker } from "../RunTypePicker";
import { TaskRunEntityPicker } from "../TaskRunEntityPicker";
import { TaskRunDatePicker } from "../TaskRunStartedAtPicker";
import { TaskRunStatusPicker } from "../TaskRunStatusPicker";
import { TasksTabs } from "../TasksTabs";

import { TaskRunsTable } from "./TaskRunsTable";
import { PAGE_SIZE } from "./constants";
import { urlStateConfig } from "./utils";

const TaskRunsPageBase = ({ location }: WithRouterProps) => {
  const [
    {
      page,
      sort_column,
      sort_direction,
      "run-type": runType,
      "entity-type": entityType,
      "entity-id": entityId,
      "started-at": startedAt,
      "include-today": includeToday,
      status,
    },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);
  const sortingOptions = { sort_column, sort_direction };

  const {
    data: taskRunsData,
    isLoading,
    error,
  } = useAbortableQuery(
    useLazyListTaskRunsQuery,
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      "sort-column": sort_column,
      "sort-direction": sort_direction,
      "run-type": runType ?? undefined,
      "entity-type": entityType ?? undefined,
      "entity-id": entityId ?? undefined,
      "started-at": toBackendStartedAt(startedAt, includeToday),
      status: status ?? undefined,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const taskRuns = taskRunsData?.data ?? [];
  const total = taskRunsData?.total ?? 0;

  const entityValue = entityType && entityId ? { entityType, entityId } : null;

  return (
    <TasksTabs>
      <Group gap="md" align="center" wrap="wrap">
        <TaskRunTypePicker
          value={runType}
          onChange={(runType) =>
            patchUrlState({
              "run-type": runType,
              "entity-type": null,
              "entity-id": null,
              page: 0,
            })
          }
        />

        <TaskRunDatePicker
          value={startedAt}
          includeToday={includeToday}
          placeholder={t`Filter by started at`}
          onChange={(nextStartedAt, nextIncludeToday) =>
            patchUrlState({
              "started-at": nextStartedAt,
              "include-today": nextIncludeToday,
              ...(nextStartedAt !== startedAt && {
                "entity-type": null,
                "entity-id": null,
              }),
              page: 0,
            })
          }
        />

        <TaskRunEntityPicker
          runType={runType}
          startedAt={startedAt}
          includeToday={includeToday}
          value={entityValue}
          onChange={(entity) =>
            patchUrlState({
              "entity-type": entity?.entityType ?? null,
              "entity-id": entity?.entityId ?? null,
              page: 0,
            })
          }
        />

        <TaskRunStatusPicker
          value={status}
          onChange={(status) => patchUrlState({ status, page: 0 })}
        />
      </Group>

      {error !== undefined ? (
        <Center flex={1}>
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : (
        <TaskRunsTable
          taskRuns={taskRuns}
          isLoading={isLoading}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={(sortingOptions) =>
            patchUrlState({ ...sortingOptions, page: 0 })
          }
        />
      )}

      {!isLoading && error === undefined && (
        <Flex justify="end">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            itemsLength={taskRuns.length}
            total={total}
            showTotal
            onPreviousPage={() => patchUrlState({ page: page - 1 })}
            onNextPage={() => patchUrlState({ page: page + 1 })}
          />
        </Flex>
      )}
    </TasksTabs>
  );
};

export const TaskRunsPage = withRouter(TaskRunsPageBase);

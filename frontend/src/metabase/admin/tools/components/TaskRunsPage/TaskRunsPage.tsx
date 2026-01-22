import { type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import { useListTaskRunsQuery } from "metabase/api";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { Flex } from "metabase/ui";

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
      "run-type": runType,
      "entity-type": entityType,
      "entity-id": entityId,
      "started-at": startedAt,
      status,
    },
    { patchUrlState },
  ] = useUrlState(location, urlStateConfig);

  const {
    data: taskRunsData,
    isLoading,
    error,
  } = useListTaskRunsQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      "run-type": runType ?? undefined,
      "entity-type": entityType ?? undefined,
      "entity-id": entityId ?? undefined,
      "started-at": startedAt ?? undefined,
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
      <Flex gap="md" justify="space-between">
        <Flex gap="md">
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
            placeholder={t`Filter by started at`}
            onChange={(startedAt) =>
              patchUrlState({
                "started-at": startedAt,
                "entity-type": null,
                "entity-id": null,
                page: 0,
              })
            }
          />

          <TaskRunEntityPicker
            runType={runType}
            startedAt={startedAt}
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
        </Flex>

        <PaginationControls
          onPreviousPage={() => patchUrlState({ page: page - 1 })}
          onNextPage={() => patchUrlState({ page: page + 1 })}
          page={page}
          pageSize={PAGE_SIZE}
          itemsLength={taskRuns.length}
          total={total}
        />
      </Flex>

      <TaskRunsTable taskRuns={taskRuns} isLoading={isLoading} error={error} />
    </TasksTabs>
  );
};

export const TaskRunsPage = withRouter(TaskRunsPageBase);

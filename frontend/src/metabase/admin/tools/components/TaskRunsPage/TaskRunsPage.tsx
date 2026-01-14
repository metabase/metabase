import type { PropsWithChildren } from "react";
import { type WithRouterProps, withRouter } from "react-router";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListTaskRunsQuery } from "metabase/api";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { Flex } from "metabase/ui";

import { RunTypePicker } from "../RunTypePicker";
import { TaskRunStatusPicker } from "../TaskRunStatusPicker";

import { TaskRunsTable } from "./TaskRunsTable";
import { PAGE_SIZE } from "./constants";
import { urlStateConfig } from "./utils";

const TaskRunsPageBase = ({
  location,
  children,
}: PropsWithChildren<WithRouterProps>) => {
  const [{ page, "run-type": runType, status }, { patchUrlState }] =
    useUrlState(location, urlStateConfig);

  const {
    data: taskRunsData,
    isLoading,
    error,
  } = useListTaskRunsQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      "run-type": runType ?? undefined,
      status: status ?? undefined,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const taskRuns = taskRunsData?.data ?? [];
  const total = taskRunsData?.total ?? 0;

  return (
    <>
      <SettingsSection>
        <Flex gap="md" justify="space-between">
          <Flex gap="md">
            <RunTypePicker
              value={runType}
              onChange={(runType) =>
                patchUrlState({ "run-type": runType, page: 0 })
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

        <TaskRunsTable
          error={error}
          isLoading={isLoading}
          taskRuns={taskRuns}
        />
      </SettingsSection>
      {children}
    </>
  );
};

export const TaskRunsPage = withRouter(TaskRunsPageBase);

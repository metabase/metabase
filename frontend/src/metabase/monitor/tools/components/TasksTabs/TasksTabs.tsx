import type { ReactNode } from "react";
import { t } from "ttag";

import { taskApi } from "metabase/api/task";
import {
  type PillTab,
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

type TasksTabsProps = {
  children: ReactNode;
};

export const TasksTabs = ({ children }: TasksTabsProps) => {
  const { currentData: counts, isError } =
    taskApi.endpoints.getTaskCounts.useQueryState(undefined);
  const tabs: PillTab[] = [
    {
      label: t`Tasks`,
      to: Urls.monitorTasksList(),
      count: getTabCount({ value: counts?.tasks, isError }),
    },
    {
      label: t`Runs`,
      to: Urls.monitorTasksRuns(),
      count: getTabCount({ value: counts?.runs, isError }),
    },
  ];

  return (
    <Flex h="100%" wrap="nowrap">
      <MonitorMain>
        <Stack gap="xl">
          <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>
          <PillTabNavigation tabs={tabs} />
        </Stack>
        {children}
      </MonitorMain>
    </Flex>
  );
};

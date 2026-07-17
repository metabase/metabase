import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type MonitorHeaderTab,
  MonitorHeaderTabs,
} from "metabase/monitor/components/MonitorHeaderTabs";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./TasksTabs.module.css";

type TasksTabsProps = {
  children: ReactNode;
};

export const TasksTabs = ({ children }: TasksTabsProps) => {
  const tabs: MonitorHeaderTab[] = [
    { label: t`Tasks`, to: Urls.monitorTasksList() },
    { label: t`Runs`, to: Urls.monitorTasksRuns() },
  ];

  return (
    <Flex h="100%" wrap="nowrap">
      <Stack className={S.main} flex={1} gap="md">
        <Stack gap="lg">
          <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>
          <MonitorHeaderTabs tabs={tabs} />
        </Stack>
        {children}
      </Stack>
    </Flex>
  );
};

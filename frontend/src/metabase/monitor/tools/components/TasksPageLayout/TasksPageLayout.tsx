import type { ReactNode } from "react";
import { t } from "ttag";

import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Flex, Stack } from "metabase/ui";

import { TasksTabs } from "../TasksTabs";

type TasksPageLayoutProps = {
  children: ReactNode;
};

export const TasksPageLayout = ({ children }: TasksPageLayoutProps) => (
  <Flex h="100%" wrap="nowrap">
    <MonitorMain>
      <Stack gap="xl">
        <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>
        <TasksTabs />
      </Stack>
      {children}
    </MonitorMain>
  </Flex>
);

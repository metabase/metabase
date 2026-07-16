import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type MonitorHeaderTab,
  MonitorHeaderTabs,
} from "metabase/monitor/components/MonitorHeaderTabs";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Flex, Icon, Stack, Tooltip } from "metabase/ui";
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
          <Flex align="center" gap="xs">
            <MonitorHeaderTitle>{t`Background tasks`}</MonitorHeaderTitle>
            <Tooltip
              label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
              events={{ hover: true, focus: true, touch: false }}
            >
              <Icon
                name="info"
                size="1rem"
                tabIndex={0}
                aria-label={t`About troubleshooting logs`}
              />
            </Tooltip>
          </Flex>
          <MonitorHeaderTabs tabs={tabs} />
        </Stack>
        {children}
      </Stack>
    </Flex>
  );
};

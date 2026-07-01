import { type WithRouterProps, withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { useDispatch } from "metabase/redux";
import { Flex, Icon, Stack, Tabs, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

type TabConfig = {
  value: string;
  label: string;
};

type TasksTabsProps = WithRouterProps & {
  children: React.ReactNode;
};

const TasksTabsBase = ({ children, location }: TasksTabsProps) => {
  const tabs: TabConfig[] = [
    { value: Urls.monitorTasksList(), label: t`Tasks` },
    { value: Urls.monitorTasksRuns(), label: t`Runs` },
  ];
  const DEFAULT_TAB = tabs[0].value;
  const dispatch = useDispatch();
  const activeTab =
    tabs.find(({ value }) => value === location.pathname)?.value ?? DEFAULT_TAB;

  const handleTabChange = (value: string | null) => {
    if (value) {
      dispatch(push(value));
    }
  };

  return (
    <Stack gap="lg">
      <Flex align="center" gap="xs">
        <MonitorHeaderTitle>{t`Troubleshooting logs`}</MonitorHeaderTitle>
        <Tooltip
          label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
        >
          <Icon name="info" size="1rem" />
        </Tooltip>
      </Flex>
      <SettingsSection>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        {children}
      </SettingsSection>
    </Stack>
  );
};

export const TasksTabs = withRouter(TasksTabsBase);

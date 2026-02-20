import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { useLocationWithQuery, useNavigation } from "metabase/routing/compat";
import { Flex, Icon, Tabs, Title, Tooltip } from "metabase/ui";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "../../../components/SettingsSection";

type TabConfig = {
  value: string;
  label: string;
};

type TasksTabsProps = {
  children: React.ReactNode;
};

export const TasksTabs = ({ children }: TasksTabsProps) => {
  const location = useLocationWithQuery();
  const tabs: TabConfig[] = [
    { value: Urls.adminToolsTasksList(), label: t`Tasks` },
    { value: Urls.adminToolsTasksRuns(), label: t`Runs` },
  ];
  const DEFAULT_TAB = tabs[0].value;
  const { push } = useNavigation();
  const activeTab =
    tabs.find(({ value }) => value === location.pathname)?.value ?? DEFAULT_TAB;

  const handleTabChange = (value: string | null) => {
    if (value) {
      push(value);
    }
  };

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <Flex align="center" gap="sm">
          <Title order={1}>{t`Troubleshooting logs`}</Title>
          <Tooltip
            label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
          >
            <Icon name="info" />
          </Tooltip>
        </Flex>
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
    </SettingsPageWrapper>
  );
};

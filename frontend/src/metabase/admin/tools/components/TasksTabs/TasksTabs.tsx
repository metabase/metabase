import { type WithRouterProps, withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon, Tabs, Title, Tooltip } from "metabase/ui";

type TabConfig = {
  value: string;
  label: string;
};

const BASE_PATH = Urls.adminToolsTasksBase();

const getActiveTab = (
  tabs: TabConfig[],
  pathname: string,
): string | undefined => {
  const relativePath = pathname.replace(BASE_PATH, "");
  const segments = relativePath.split("/").filter(Boolean);
  const firstSegment = segments[0];
  return tabs.find((tab) => tab.value === firstSegment)?.value;
};

type TasksTabsProps = WithRouterProps & {
  children: React.ReactNode;
};

const TasksTabsBase = ({ children, location }: TasksTabsProps) => {
  const tabs: TabConfig[] = [
    { value: "list", label: t`Tasks` },
    { value: "runs", label: t`Runs` },
  ];
  const DEFAULT_TAB = tabs[0].value;
  const dispatch = useDispatch();
  const activeTab = getActiveTab(tabs, location.pathname) ?? DEFAULT_TAB;

  const handleTabChange = (value: string | null) => {
    if (value) {
      dispatch(push(`${BASE_PATH}/${value}`));
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

export const TasksTabs = withRouter(TasksTabsBase);

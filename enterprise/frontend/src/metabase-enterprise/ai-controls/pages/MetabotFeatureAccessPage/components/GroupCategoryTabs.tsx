import { t } from "ttag";

import { Tabs } from "metabase/ui";

import type { GroupTab } from "../utils";

type TabOption = {
  tab: GroupTab;
  label: string;
};

type GroupCategoryTabsProps = {
  activeTab: GroupTab;
  setActiveTab: (tab: GroupTab) => void;
};

export const GroupCategoryTabs = (props: GroupCategoryTabsProps) => {
  const { activeTab, setActiveTab } = props;
  const tabItems: TabOption[] = [
    { tab: "user-groups", label: t`User groups` },
    { tab: "tenant-groups", label: t`Tenant groups` },
  ];

  return (
    <Tabs
      variant="pills"
      value={activeTab}
      onChange={(value) => {
        if (value) {
          setActiveTab(value);
        }
      }}
    >
      <Tabs.List>
        {tabItems.map((tabItem) => (
          <Tabs.Tab key={tabItem.tab} value={tabItem.tab}>
            {tabItem.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
};

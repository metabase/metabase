import { t } from "ttag";

import { Button, Group } from "metabase/ui";

import type { GroupTab } from "./utils";

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
    <Group gap="sm" mb="md">
      {tabItems.map((tabItem) => (
        <Button
          bd="none"
          bg={activeTab === tabItem.tab ? "background-selected" : "transparent"}
          c={activeTab === tabItem.tab ? "brand" : "text-secondary"}
          key={tabItem.tab}
          onClick={() => setActiveTab(tabItem.tab)}
          radius="xl"
          size="xs"
        >
          {tabItem.label}
        </Button>
      ))}
    </Group>
  );
};

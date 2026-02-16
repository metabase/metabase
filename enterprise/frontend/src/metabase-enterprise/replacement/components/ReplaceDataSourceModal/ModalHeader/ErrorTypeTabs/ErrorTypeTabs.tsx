import { Tabs } from "metabase/ui";

import type { TabInfo, TabType } from "../../types";

import S from "./ErrorTypeTabs.module.css";
import { getTabLabel } from "./utils";

type ErrorTypeTabsProps = {
  tabs: TabInfo[];
  selectedTabType: TabType | undefined;
  onTabChange: (tabType: TabType) => void;
};

export function ErrorTypeTabs({
  tabs,
  selectedTabType,
  onTabChange,
}: ErrorTypeTabsProps) {
  const handleTabChange = (value: string | null) => {
    const tab = tabs.find((tab) => tab.type === value);
    if (tab != null) {
      onTabChange(tab.type);
    }
  };

  return (
    <Tabs value={selectedTabType} onChange={handleTabChange}>
      <Tabs.List className={S.tabList}>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.type} value={tab.type}>
            {getTabLabel(tab)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

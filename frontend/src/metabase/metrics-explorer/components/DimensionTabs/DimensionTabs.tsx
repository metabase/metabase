import { useSelector } from "metabase/lib/redux";
import { Tabs } from "metabase/ui";

import { selectDimensionTabs } from "../../selectors";

import S from "./DimensionTabs.module.css";

interface DimensionTabsProps {
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

export function DimensionTabs({ activeTabId, onTabChange }: DimensionTabsProps) {
  const dimensionTabs = useSelector(selectDimensionTabs);

  // Don't render tabs if there's only the time tab (or no tabs)
  if (dimensionTabs.length <= 1) {
    return null;
  }

  return (
    <div className={S.container}>
      <Tabs
        value={activeTabId}
        onChange={(value) => value && onTabChange(value)}
        className={S.tabs}
      >
        <Tabs.List className={S.tabsList}>
          {dimensionTabs.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  );
}

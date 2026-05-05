import { msgid, ngettext, t } from "ttag";

import { Box, Tabs } from "metabase/ui";

import type { TabType } from "../../types";

import S from "./TabPanel.module.css";

type TabPanelProps = {
  selectedTab: TabType;
  canReplace: boolean;
  dependentsCount: number;
  onTabChange: (tab: TabType) => void;
};

export function TabPanel({
  selectedTab,
  canReplace,
  dependentsCount,
  onTabChange,
}: TabPanelProps) {
  const handleChange = (value: string | null) => {
    if (value === "column-mappings" || value === "dependents") {
      onTabChange(value);
    }
  };

  return (
    <Box className={S.panel} px="lg" bg="background-primary">
      <Tabs value={selectedTab} onChange={handleChange}>
        <Tabs.List className={S.tabs}>
          <Tabs.Tab value="column-mappings">{t`Column comparison`}</Tabs.Tab>
          {canReplace && (
            <Tabs.Tab value="dependents">
              {getDependentsTabLabel(dependentsCount)}
            </Tabs.Tab>
          )}
        </Tabs.List>
      </Tabs>
    </Box>
  );
}

function getDependentsTabLabel(dependentsCount: number) {
  return ngettext(
    msgid`${dependentsCount} item will be changed`,
    `${dependentsCount} items will be changed`,
    dependentsCount,
  );
}

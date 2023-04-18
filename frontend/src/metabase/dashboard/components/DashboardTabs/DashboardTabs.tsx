import React from "react";
import { t } from "ttag";

import TabRow from "metabase/core/components/TabRow";
import { SelectedTabId } from "metabase-types/store";

import {
  Container,
  Tab,
  CreateTabButton,
  PlaceholderTab,
} from "./DashboardTabs.styled";
import { useDashboardTabs } from "./useDashboardTabs";

interface DashboardTabsProps {
  isEditing: boolean;
}

export function DashboardTabs({ isEditing }: DashboardTabsProps) {
  const { tabs, createNewTab, deleteTab, selectTab, selectedTabId } =
    useDashboardTabs();
  const showPlaceholder = tabs.length === 0 && isEditing;

  return (
    <Container>
      <TabRow<SelectedTabId> value={selectedTabId} onChange={selectTab}>
        {showPlaceholder && <PlaceholderTab />}
        {tabs.map(tab => (
          <Tab<SelectedTabId>
            key={tab.id}
            value={tab.id}
            label={tab.name}
            // TODO update this
            onRename={newName => console.log(`Renamed tab to ${newName}`)}
            showMenu={isEditing}
            menuItems={[
              {
                label: t`Delete`,
                action: (_, value) => deleteTab(value),
              },
            ]}
          />
        ))}
      </TabRow>
      {isEditing && (
        <CreateTabButton icon="add" iconSize={12} onClick={createNewTab} />
      )}
    </Container>
  );
}

import React from "react";
import { t } from "ttag";

import TabRow from "metabase/core/components/TabRow";

import { Container, TabButton, Button } from "./DashboardTabs.styled";
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
      <TabRow value={selectedTabId ?? 0 /* fix */} onChange={selectTab}>
        {showPlaceholder && (
          // TODO make this a separate styled component (PlaceholderTabButton)
          <TabButton
            label={t`Page 1`}
            onRename={() => null}
            showMenu={false}
            disabled
          />
        )}
        {
          // TODO sort by position
          tabs.map(tab => (
            <TabButton
              key={tab.id}
              value={tab.id}
              label={tab.name}
              // TODO update this
              onRename={newName => console.log(`Renamed tab to ${newName}`)}
              showMenu={isEditing}
              menuItems={[
                {
                  label: t`Delete`,
                  action: (_, value) =>
                    // TODO improve typesafety of TabButton (use generic?)
                    deleteTab(typeof value === "number" ? value : 0),
                },
              ]}
            />
          ))
        }
      </TabRow>
      {isEditing && <Button icon="add" iconSize={12} onClick={createNewTab} />}
    </Container>
  );
}

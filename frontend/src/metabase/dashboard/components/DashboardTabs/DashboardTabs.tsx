import { t } from "ttag";

import { TabRow } from "metabase/core/components/TabRow";
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
  const { tabs, createNewTab, deleteTab, renameTab, selectTab, selectedTabId } =
    useDashboardTabs();
  const showTabs = tabs.length > 1 || isEditing;
  const showPlaceholder = tabs.length <= 1 && isEditing;

  if (!showTabs) {
    return null;
  }

  return (
    <Container>
      <TabRow<SelectedTabId> value={selectedTabId} onChange={selectTab}>
        {showPlaceholder ? (
          <PlaceholderTab
            label={tabs.length === 1 ? tabs[0].name : t`Page 1`}
          />
        ) : (
          tabs.map(tab => (
            <Tab<SelectedTabId>
              key={tab.id}
              value={tab.id}
              label={tab.name}
              onRename={name => renameTab(tab.id, name)}
              canRename={isEditing}
              showMenu={isEditing}
              menuItems={[
                {
                  label: t`Delete`,
                  action: (_, value) => deleteTab(value),
                },
              ]}
            />
          ))
        )}
        {isEditing && (
          <CreateTabButton
            icon="add"
            iconSize={12}
            onClick={createNewTab}
            aria-label={t`Create new tab`}
          />
        )}
      </TabRow>
    </Container>
  );
}

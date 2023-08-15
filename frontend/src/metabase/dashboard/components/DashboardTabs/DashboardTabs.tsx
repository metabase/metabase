import { t } from "ttag";

import type { Location } from "history";
import { TabRow } from "metabase/core/components/TabRow";
import { TabButton } from "metabase/core/components/TabButton";
import { SelectedTabId } from "metabase-types/store";
import { Sortable } from "metabase/core/components/Sortable";

import {
  Container,
  CreateTabButton,
  PlaceholderTab,
} from "./DashboardTabs.styled";
import { useDashboardTabs } from "./use-dashboard-tabs";

interface DashboardTabsProps {
  location: Location;
  isEditing?: boolean;
}

export function DashboardTabs({
  location,
  isEditing = false,
}: DashboardTabsProps) {
  const {
    tabs,
    createNewTab,
    deleteTab,
    renameTab,
    selectTab,
    selectedTabId,
    moveTab,
  } = useDashboardTabs({ location });
  const showTabs = tabs.length > 1 || isEditing;
  const showPlaceholder = tabs.length <= 1 && isEditing;

  if (!showTabs) {
    return null;
  }

  return (
    <Container>
      <TabRow<SelectedTabId>
        value={selectedTabId}
        onChange={selectTab}
        itemIds={tabs.map(tab => tab.id)}
        handleDragEnd={moveTab}
      >
        {showPlaceholder ? (
          <PlaceholderTab label={tabs.length === 1 ? tabs[0].name : t`Tab 1`} />
        ) : (
          tabs.map(tab => (
            <Sortable key={tab.id} id={tab.id} disabled={!isEditing}>
              <TabButton.Renameable<SelectedTabId>
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
            </Sortable>
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

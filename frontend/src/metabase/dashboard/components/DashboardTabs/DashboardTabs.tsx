import React from "react";
import { t } from "ttag";
import type { UniqueIdentifier } from "@dnd-kit/core";

import { TabRow } from "metabase/core/components/TabRow";
import { SelectedTabId, StoreDashboardTab } from "metabase-types/store";

import { Sortable } from "metabase/core/components/Sortable";
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
  const {
    tabs,
    selectedTabId,
    createNewTab,
    deleteTab,
    renameTab,
    selectTab,
    moveTab,
  } = useDashboardTabs();
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
        renderDragOverlayChildren={activeId => (
          <DragOverlayTab tabs={tabs} activeId={activeId} />
        )}
      >
        {showPlaceholder ? (
          <PlaceholderTab
            label={tabs.length === 1 ? tabs[0].name : t`Page 1`}
          />
        ) : (
          tabs.map(tab => (
            <Sortable key={tab.id} id={tab.id} disabled={!isEditing}>
              <Tab<SelectedTabId>
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

function DragOverlayTab({
  tabs,
  activeId,
}: {
  tabs: StoreDashboardTab[];
  activeId: UniqueIdentifier;
}) {
  const parsedId = typeof activeId === "number" ? activeId : parseInt(activeId);
  const tab = tabs.find(tab => tab.id === parsedId);
  if (!tab) {
    return null;
  }

  return <PlaceholderTab label={tab.name} />;
}

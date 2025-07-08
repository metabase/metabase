import { t } from "ttag";

import Button from "metabase/common/components/Button";
import { Sortable } from "metabase/common/components/Sortable";
import type { TabButtonMenuItem } from "metabase/common/components/TabButton";
import { TabButton } from "metabase/common/components/TabButton";
import { TabRow } from "metabase/common/components/TabRow";
import { useDashboardContext } from "metabase/dashboard/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Flex } from "metabase/ui";
import type { SelectedTabId } from "metabase-types/store";

import S from "./DashboardTabs.module.css";
import { useDashboardTabs } from "./use-dashboard-tabs";

export function DashboardTabs() {
  const { isEditing = false } = useDashboardContext();

  const {
    tabs,
    createNewTab,
    duplicateTab,
    deleteTab,
    renameTab,
    selectTab,
    selectedTabId,
    moveTab,
  } = useDashboardTabs();
  const hasMultipleTabs = tabs.length > 1;
  const showTabs = hasMultipleTabs || isEditing;
  const showPlaceholder = tabs.length === 0 && isEditing;

  useRegisterShortcut(
    [
      {
        id: "dashboard-change-tab",
        perform: (_, event) => {
          if (!event?.key) {
            return;
          }
          const key = parseInt(event.key);
          const tab = tabs[key - 1];
          if (tab) {
            selectTab(tab.id);
          }
        },
      },
    ],
    [tabs],
  );

  if (!showTabs) {
    return null;
  }

  const menuItems: TabButtonMenuItem[] = [
    {
      label: t`Duplicate`,
      action: (_, value) => duplicateTab(value),
    },
  ];
  if (hasMultipleTabs) {
    menuItems.push({
      label: t`Delete`,
      action: (_, value) => deleteTab(value),
    });
  }

  return (
    <Flex align="start" gap="lg" w="100%" className={S.dashboardTabs}>
      <TabRow<SelectedTabId>
        value={selectedTabId}
        onChange={selectTab}
        itemIds={tabs.map((tab) => tab.id)}
        handleDragEnd={moveTab}
      >
        {showPlaceholder ? (
          <TabButton
            label={t`Tab 1`}
            value={null}
            showMenu
            menuItems={menuItems}
          />
        ) : (
          tabs.map((tab) => (
            <Sortable key={tab.id} id={tab.id} disabled={!isEditing}>
              <TabButton.Renameable
                value={tab.id}
                label={tab.name}
                onRename={(name) => renameTab(tab.id, name)}
                canRename={isEditing && hasMultipleTabs}
                showMenu={isEditing}
                menuItems={menuItems}
              />
            </Sortable>
          ))
        )}
        {isEditing && (
          <Button
            icon="add"
            iconSize={12}
            onClick={createNewTab}
            aria-label={t`Create new tab`}
            className={S.createTabButton}
          />
        )}
      </TabRow>
    </Flex>
  );
}

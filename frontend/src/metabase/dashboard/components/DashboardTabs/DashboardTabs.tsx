import { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import { Sortable } from "metabase/core/components/Sortable";
import type { TabButtonMenuItem } from "metabase/core/components/TabButton";
import { TabButton } from "metabase/core/components/TabButton";
import { TabRow } from "metabase/core/components/TabRow";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Flex, Portal, Tabs } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import S from "./DashboardTabs.module.css";
import { useDashboardTabs } from "./use-dashboard-tabs";

export type DashboardTabsProps = {
  dashboardId: DashboardId;
  isEditing?: boolean;
  className?: string;
};

const FLAG_MANTINE = 0b0001;
const FLAG_REAL = 0b0010;

export function DashboardTabs({
  dashboardId,
  isEditing = false,
  className,
}: DashboardTabsProps) {
  const [debugFlags, setDebugFlags] = useState(FLAG_REAL);
  const [debugDismissed, setDebugDismissed] = useState(false);

  const {
    tabs,
    createNewTab,
    duplicateTab,
    deleteTab,
    renameTab,
    selectTab,
    selectedTabId,
    moveTab,
  } = useDashboardTabs({ dashboardId });
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

  type DebugOption = { label: string; flags: number };
  const debugOptions: DebugOption[] = [
    { label: "Only real", flags: FLAG_REAL },
    { label: "Only mantine (for reference only)", flags: FLAG_MANTINE },
    { label: "Both", flags: FLAG_MANTINE | FLAG_REAL },
  ];

  return (
    <Flex align="start" gap="lg" w="100%" className={className}>
      {/* Debug only. Do not merge. */}
      {!debugDismissed && (
        <Portal>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "darkred",
              color: "wheat",
              padding: "0.25rem",
            }}
          >
            <div style={{ fontWeight: "bold", display: "flex" }}>
              {"TAB DEBUG"}
              <button
                style={{
                  color: "white",
                  marginLeft: "auto",
                  cursor: "pointer",
                }}
                onClick={() => setDebugDismissed(true)}
              >
                X
              </button>
            </div>
            {debugOptions.map((debugOption) => {
              const isSelected = debugFlags === debugOption.flags;
              return (
                <button
                  key={debugOption.flags}
                  onClick={() => setDebugFlags(debugOption.flags)}
                  style={{
                    cursor: "pointer",
                    opacity: isSelected ? 1 : 0.5,
                    color: "white",
                    padding: "0.25rem",
                  }}
                >
                  {debugOption.label}
                </button>
              );
            })}
          </div>
        </Portal>
      )}
      {!!(debugFlags & FLAG_MANTINE) && (
        <Tabs value={String(selectedTabId)}>
          <Tabs.List style={{ flexWrap: "nowrap" }}>
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} value={String(tab.id)}>
                {tab.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      {!!(debugFlags & FLAG_REAL) && (
        <TabRow<SelectedTabId>
          value={selectedTabId}
          onChange={selectTab}
          itemIds={tabs.map((tab) => tab.id)}
          handleDragEnd={moveTab}
        >
          {showPlaceholder ? (
            <TabButton
              className={S.tabButton}
              label={t`Tab 1`}
              value={null}
              showMenu
              menuItems={menuItems}
            />
          ) : (
            tabs.map((tab) => (
              <Sortable
                key={tab.id}
                id={tab.id}
                className={S.tabButton}
                disabled={!isEditing}
              >
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
      )}
    </Flex>
  );
}

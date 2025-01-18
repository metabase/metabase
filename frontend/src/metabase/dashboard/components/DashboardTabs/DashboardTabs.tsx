import { t } from "ttag";

import { Sortable } from "metabase/core/components/Sortable";
import type { TabButtonMenuItem } from "metabase/core/components/TabButton";
import { TabButton } from "metabase/core/components/TabButton";
import { TabRow } from "metabase/core/components/TabRow";
import { MaybeTranslationCannotBeEditedHoverCard } from "metabase/i18n/MaybeTranslationCannotBeEditedHoverCard";
import { useTranslateContent } from "metabase/i18n/components/ContentTranslationContext";
import type { DashboardId } from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import { Container, CreateTabButton } from "./DashboardTabs.styled";
import { useDashboardTabs } from "./use-dashboard-tabs";

export type DashboardTabsProps = {
  dashboardId: DashboardId;
  isEditing?: boolean;
  className?: string;
};

export function DashboardTabs({
  dashboardId,
  isEditing = false,
  className,
}: DashboardTabsProps) {
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

  const tc = useTranslateContent();

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
    <Container className={className}>
      <TabRow<SelectedTabId>
        value={selectedTabId}
        onChange={selectTab}
        itemIds={tabs.map(tab => tab.id)}
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
          tabs.map(tab => {
            const localizedName = tc(tab, "name");
            const isNameLocalized = localizedName !== tab.name;
            return (
              <Sortable key={tab.id} id={tab.id} disabled={!isEditing}>
                <MaybeTranslationCannotBeEditedHoverCard
                  isLocalized={isNameLocalized}
                >
                  <TabButton.Renameable
                    value={tab.id}
                    label={localizedName}
                    onRename={name => renameTab(tab.id, name)}
                    canRename={isEditing && hasMultipleTabs && !isNameLocalized}
                    showMenu={isEditing}
                    menuItems={menuItems}
                  />
                </MaybeTranslationCannotBeEditedHoverCard>
              </Sortable>
            );
          })
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

import { t } from "ttag/types";
import type { DashCardId } from "metabase-types/api";
import type { StoreDashboardTab } from "metabase-types/store";
import { Icon } from "metabase/core/components/Icon";
import { Menu } from "metabase/ui";
import { useDashCardTabMenu } from "./use-dash-card-tab-menu";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
}

export function DashCardTabMenu({ dashCardId }: DashCardTabMenuProps) {
  const { showMenu, tabs, moveToTab } = useDashCardTabMenu(dashCardId);
  const [suggestedTab, ...otherTabs] = tabs;

  if (!showMenu) {
    return null;
  }

  // TODO menu html + styles
  return (
    <div>
      <a onClick={() => moveToTab(suggestedTab.id)}>
        {t`Move to`} {suggestedTab.name}
      </a>
      {otherTabs.length > 1 && (
        <TabChevronMenu
          tabs={otherTabs}
          onTabSelect={tabId => moveToTab(tabId)}
        />
      )}
    </div>
  );
}

type TabChevronMenuProps = {
  tabs: StoreDashboardTab[];
  onTabSelect: (tabId: number) => void;
};

function TabChevronMenu({ tabs, onTabSelect }: TabChevronMenuProps) {
  return (
    <Menu
      // inline to not close the actions menu when hovered
      withinPortal={false}
    >
      <Menu.Target>
        <Icon name="chevrondown" />
      </Menu.Target>
      <Menu.Dropdown>
        {tabs.map(tab => {
          return (
            <Menu.Item key={tab.id} onClick={() => onTabSelect(tab.id)}>
              {tab.name}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

import { t } from "ttag";
import type { DashCardId } from "metabase-types/api";
import type { StoreDashboardTab } from "metabase-types/store";
import { Menu, Text } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";
import { useDashCardTabMenu } from "./use-dash-card-tab-menu";
import {
  TabButton,
  VerticalDivider,
  ChevronStyledIcon,
} from "./DashCardTabMenu.styled";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
}

export function DashCardTabMenu({ dashCardId }: DashCardTabMenuProps) {
  const { showMenu, tabs, moveToTab } = useDashCardTabMenu(dashCardId);
  const [suggestedTab, ...otherTabs] = tabs;

  if (!showMenu) {
    return null;
  }

  return (
    <>
      <Text color="bg-dark" size="sm" ml={5}>
        {t`Move to `}
        <Tooltip tooltip={t`Move to ${suggestedTab.name} tab`}>
          <TabButton size="sm" onClick={() => moveToTab(suggestedTab.id)}>
            {suggestedTab.name}
          </TabButton>
        </Tooltip>
      </Text>

      {otherTabs.length > 1 && (
        <TabChevronMenu
          tabs={otherTabs}
          onTabSelect={tabId => moveToTab(tabId)}
        />
      )}

      <VerticalDivider />
    </>
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
        <ChevronStyledIcon name="chevrondown" />
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

import { t } from "ttag";
import type { DashCardId } from "metabase-types/api";
import type { StoreDashboardTab } from "metabase-types/store";
import { Menu, Divider, Text } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";
import { useDashCardTabMenu } from "./use-dash-card-tab-menu";
import { TabButton, ChevronStyledIcon } from "./DashCardTabMenu.styled";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
}

export function DashCardTabMenu({ dashCardId }: DashCardTabMenuProps) {
  const { showMenu, tabs, moveToTab } = useDashCardTabMenu(dashCardId);
  const [suggestedTab] = tabs;

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

      {tabs.length > 1 && (
        <TabChevronMenu tabs={tabs} onTabSelect={tabId => moveToTab(tabId)} />
      )}

      <Divider orientation="vertical" my={4} />
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

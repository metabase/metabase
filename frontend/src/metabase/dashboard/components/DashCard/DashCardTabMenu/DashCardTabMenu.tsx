import { t } from "ttag";
import type { DashCardId } from "metabase-types/api";
import { Divider, Menu } from "metabase/ui";
import DashCardActionButton from "../DashCardActionButtons/DashCardActionButton";
import { MoveDashCardActionContainer } from "./DashCardTabMenu.styled";
import { useDashCardTabMenu } from "./use-dash-card-tab-menu";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
}

export function DashCardTabMenu({ dashCardId }: DashCardTabMenuProps) {
  const { showMenu, tabs, moveToTab } = useDashCardTabMenu(dashCardId);

  if (!showMenu) {
    return null;
  }

  return (
    <>
      <Menu
        trigger="hover"
        // inline to not close the actions menu when hovered
        withinPortal={false}
      >
        <Menu.Target>
          <MoveDashCardActionContainer>
            <DashCardActionButton.Icon name="move_card" />
          </MoveDashCardActionContainer>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t`Move to tab`}</Menu.Label>
          {tabs.map(tab => {
            return (
              <Menu.Item
                maw={300}
                key={tab.id}
                onClick={() => moveToTab(tab.id)}
              >
                {tab.name}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>

      <Divider orientation="vertical" my={4} />
    </>
  );
}

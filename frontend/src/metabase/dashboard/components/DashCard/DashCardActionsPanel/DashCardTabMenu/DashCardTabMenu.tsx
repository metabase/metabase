import { t } from "ttag";
import { useCallback, useMemo } from "react";
import type { DashCardId } from "metabase-types/api";
import { Divider, Menu } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { moveDashCardToTab } from "metabase/dashboard/actions";
import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";
import { MoveDashCardActionStyled } from "./DashCardTabMenu.styled";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
  onOpen: () => void;
  onClose: () => void;
}

export function DashCardTabMenu({
  dashCardId,
  onClose,
  onOpen,
}: DashCardTabMenuProps) {
  const dispatch = useDispatch();
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const showMenu = tabs.length > 1;

  const tabsToShow = useMemo(() => {
    return tabs.filter(t => t.id !== selectedTabId);
  }, [selectedTabId, tabs]);

  const moveDashcard = useCallback(
    (destinationTabId: number) => {
      dispatch(moveDashCardToTab({ dashCardId, destinationTabId }));
    },
    [dashCardId, dispatch],
  );

  if (!showMenu) {
    return null;
  }

  return (
    <>
      <Menu trigger="hover" onOpen={onOpen} onClose={onClose}>
        <Menu.Target>
          <MoveDashCardActionStyled>
            <DashCardActionButton.Icon name="move_card" />
          </MoveDashCardActionStyled>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t`Move to tab`}</Menu.Label>
          {tabsToShow.map(tab => {
            return (
              <Menu.Item
                maw={300}
                key={tab.id}
                onClick={() => moveDashcard(tab.id)}
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

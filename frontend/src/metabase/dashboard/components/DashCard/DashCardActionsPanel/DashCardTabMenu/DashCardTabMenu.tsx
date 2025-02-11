import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { moveDashCardToTab } from "metabase/dashboard/actions";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Divider, Menu } from "metabase/ui";
import type { BaseDashboardCard } from "metabase-types/api";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

import { MoveDashCardActionStyled } from "./DashCardTabMenu.styled";
import { MoveQuestionModal } from "metabase/query_builder/components/MoveQuestionModal";
import Question from "metabase-lib/v1/Question";
import { useModal } from "metabase/hooks/use-modal";

interface DashCardTabMenuProps {
  dashcard: Pick<BaseDashboardCard, "id" | "card">;
  onMove: (removeAllRelatedDashcards: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}

// TODO: rename this component
export function DashCardTabMenu({
  dashcard,
  onMove,
  onClose,
  onOpen,
}: DashCardTabMenuProps) {
  const dispatch = useDispatch();
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const moveModal = useModal();

  const showMenu = tabs.length > 1 || dashcard.card.dashboard_id;

  const tabsToShow = useMemo(() => {
    return tabs.filter(t => t.id !== selectedTabId);
  }, [selectedTabId, tabs]);

  const moveDashcardToTab = useCallback(
    (destinationTabId: number) => {
      dispatch(
        moveDashCardToTab({ dashCardId: dashcard.id, destinationTabId }),
      );
    },
    [dashcard.id, dispatch],
  );

  // TODO: refactor away, we should be able to just compute based on how many results we want to render..
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
          <Menu.Label>{t`Move to...`}</Menu.Label>
          {tabsToShow.map(tab => (
            <Menu.Item
              maw={300}
              key={tab.id}
              onClick={() => moveDashcardToTab(tab.id)}
            >
              {tab.name}
            </Menu.Item>
          ))}
          {dashcard.card.dashboard_id && (
            <Menu.Item
              maw={300}
              key="move-out-of-dashboard"
              onClick={moveModal.open}
            >
              Another dashboard or collection
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      <Divider orientation="vertical" my={4} />

      {moveModal.opened && (
        <MoveQuestionModal
          question={new Question(dashcard.card)}
          onClose={moveModal.close}
          onMove={onMove}
          isOnDashboardPage
        />
      )}
    </>
  );
}

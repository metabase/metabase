import { t } from "ttag";
import _ from "underscore";

import type {
  DashCardId,
  Dashboard,
  QuestionDashboardCard,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { StoreDashboard, StoreDashcard } from "metabase-types/store";

import { isActionDashCard } from "../utils";

export function getExistingDashCards(
  dashboards: Record<DashboardId, StoreDashboard>,
  dashcards: Record<DashCardId, StoreDashcard>,
  dashId: DashboardId,
  tabId: DashboardTabId | null = null,
) {
  const dashboard = dashboards[dashId];

  return dashboard.dashcards
    .map(id => dashcards[id])
    .filter(dc => {
      if (dc.isRemoved) {
        return false;
      }
      if (tabId != null) {
        return dc.dashboard_tab_id === tabId;
      }
      return true;
    });
}

export function hasDashboardChanged(
  dashboard: Dashboard,
  dashboardBeforeEditing: Dashboard,
) {
  return !_.isEqual(
    { ...dashboard, dashcards: dashboard.dashcards.length },
    {
      ...dashboardBeforeEditing,
      dashcards: dashboardBeforeEditing.dashcards.length,
    },
  );
}

// sometimes the cards objects change order but all the cards themselves are the same
// this should not trigger a save
export function haveDashboardCardsChanged(
  newCards: QuestionDashboardCard[],
  oldCards: QuestionDashboardCard[],
) {
  return (
    newCards.length !== oldCards.length ||
    !newCards.every(newCard =>
      oldCards.some(oldCard => _.isEqual(oldCard, newCard)),
    )
  );
}

export const getDashCardMoveToTabUndoMessage = (dashCard: StoreDashcard) => {
  const virtualCardType =
    dashCard.visualization_settings?.virtual_card?.display;

  if (isActionDashCard(dashCard)) {
    return t`Action card moved`;
  }

  if (dashCard.card?.name) {
    return t`Card moved: ${dashCard.card.name}`;
  }

  switch (virtualCardType) {
    case "text":
      return t`Text card moved`;
    case "heading":
      return t`Heading card moved`;
    case "link":
      return t`Link card moved`;
    default:
      return t`Card moved`;
  }
};

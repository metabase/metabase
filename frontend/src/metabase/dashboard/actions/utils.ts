import { t } from "ttag";
import _ from "underscore";

import { getIframeDomainName } from "metabase/visualizations/visualizations/IFrameViz/utils";
import type {
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { StoreDashboard, StoreDashcard } from "metabase-types/store";

import { trackIFrameDashcardsSaved } from "../analytics";
import { isActionDashCard, isIFrameDashCard } from "../utils";

export function getExistingDashCards(
  dashboards: Record<DashboardId, StoreDashboard>,
  dashcards: Record<DashCardId, StoreDashcard>,
  dashId: DashboardId,
  tabId: DashboardTabId | null = null,
) {
  const dashboard = dashboards[dashId];

  return dashboard.dashcards
    .map((id) => dashcards[id])
    .filter((dc) => {
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
  dashboard: Dashboard | { dashcards: DashboardCard[] },
  dashboardBeforeEditing: Dashboard | { dashcards: DashboardCard[] },
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
  newCards: DashboardCard[],
  oldCards: DashboardCard[],
) {
  return (
    newCards.length !== oldCards.length ||
    !newCards.every((newCard) =>
      oldCards.some((oldCard) => _.isEqual(oldCard, newCard)),
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

export const trackAddedIFrameDashcards = (dashboard: Dashboard) => {
  try {
    const newIFrameDashcards = dashboard.dashcards.filter(
      (dashcard) =>
        "isAdded" in dashcard && dashcard.isAdded && isIFrameDashCard(dashcard),
    );

    newIFrameDashcards.forEach((dashcard) => {
      const domainName = getIframeDomainName(
        dashcard.visualization_settings?.iframe,
      );
      trackIFrameDashcardsSaved(dashboard.id, domainName);
    });
  } catch {
    console.error("Could not track added iframe dashcards", dashboard);
  }
};

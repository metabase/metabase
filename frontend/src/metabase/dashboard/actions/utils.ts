import _ from "underscore";
import type {
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { StoreDashboard, StoreDashcard } from "metabase-types/store";

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
  newCards: DashboardCard[],
  oldCards: DashboardCard[],
) {
  return (
    !newCards.every(newCard =>
      oldCards.some(oldCard => _.isEqual(oldCard, newCard)),
    ) ||
    !oldCards.every(oldCard =>
      newCards.some(newCard => _.isEqual(oldCard, newCard)),
    )
  );
}

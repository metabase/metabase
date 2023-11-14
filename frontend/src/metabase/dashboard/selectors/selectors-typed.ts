import type { DashboardId, DashCardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export function getDashboardId(state: State) {
  return state.dashboard.dashboardId;
}

export function getTabs(state: State) {
  const dashboardId = getDashboardId(state);
  return dashboardId
    ? state.dashboard.dashboards[dashboardId].tabs?.filter(
        tab => !tab.isRemoved,
      ) ?? []
    : [];
}

export function getSelectedTabId(state: State) {
  return state.dashboard.selectedTabId;
}

export const getDisabledAutoWireCards = (
  state: State,
  dashboardId: DashboardId,
) => {
  return (
    state.dashboard.autoWireParameters.disabledDashcards[dashboardId] || []
  );
};

export const getIsCardAutoWiringDisabled = (
  state: State,
  dashboardId: DashboardId,
  dashcardId: DashCardId,
) => {
  const disabledDashcardIds = getDisabledAutoWireCards(state, dashboardId);

  return disabledDashcardIds && disabledDashcardIds.includes(dashcardId);
};

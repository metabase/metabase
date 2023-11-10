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

export const getAutoWireParameterToast = (state: State) =>
  state.dashboard.autoWireParameters.toast;

export const getIsCardAutoWiringDisabled = (
  state: State,
  dashboardId: DashboardId,
  dashcardId: DashCardId,
) => {
  const disabledDashcardIds =
    state.dashboard.autoWireParameters.disabledDashcards[dashboardId];

  return disabledDashcardIds && disabledDashcardIds.includes(dashcardId);
};

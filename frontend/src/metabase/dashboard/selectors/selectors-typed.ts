import type { DashCardId } from "metabase-types/api";
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

export function getDashcards(state: State) {
  return state.dashboard.dashcards;
}

export function getDashCardById(state: State, dashcardId: DashCardId) {
  const dashcards = getDashcards(state);
  return dashcards[dashcardId];
}

import type { DashCardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export function getDashboardId(state: State) {
  return state.dashboard.dashboardId;
}

export function getDashboardBeforeEditing(state: State) {
  return state.dashboard.isEditing;
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

export const getDashcards = (state: State) => state.dashboard.dashcards;

export const getDashCardById = (state: State, dashcardId: DashCardId) => {
  const dashcards = getDashcards(state);
  return dashcards[dashcardId];
};

export function getDashCardBeforeEditing(state: State, dashcardId: DashCardId) {
  const dashboard = getDashboardBeforeEditing(state);
  return dashboard?.dashcards?.find?.(dashcard => dashcard.id === dashcardId);
}

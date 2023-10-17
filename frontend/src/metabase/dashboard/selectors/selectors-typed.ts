import type { State } from "metabase-types/store";

export function getDashboardId(state: State) {
  return state.dashboard.dashboardId;
}

export function getTabs(state: State) {
  const dashboardId = getDashboardId(state);
  return dashboardId
    ? state.dashboard.dashboards[dashboardId].ordered_tabs?.filter(
        tab => !tab.isRemoved,
      ) ?? []
    : [];
}

export function getSelectedTabId(state: State) {
  return state.dashboard.selectedTabId;
}

import type { State } from "metabase-types/store";

export function getDashboardId(state: State) {
  return state.dashboard.dashboardId;
}

export function getSelectedTabId(state: State) {
  return state.dashboard.selectedTabId;
}

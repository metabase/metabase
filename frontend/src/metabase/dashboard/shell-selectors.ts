import { createSelector } from "@reduxjs/toolkit";

import type { State, StoreDashboard } from "metabase/redux/store";

/**
 * The dashboard selectors the app shell reads on every page.
 *
 * They live here rather than in `dashboard/selectors` so that the nav bar and
 * `app/selectors` can name them without importing that module. `selectors.ts`
 * reaches metabase-lib, the parameter utilities and the visualization settings,
 * so anything that imports it puts the dashboard feature in the initial bundle.
 *
 * `dashboard/selectors` re-exports all of these, so no other call site changes.
 */
export const getDashboardId = (state: State) => state.dashboard.dashboardId;

export const getDashboards = (state: State) => state.dashboard.dashboards;

export const getDashboardBeforeEditing = (state: State) =>
  state.dashboard.editingDashboard;

export const getIsEditing = (state: State) =>
  Boolean(getDashboardBeforeEditing(state));

export const getDashboard = createSelector(
  [getDashboardId, getDashboards],
  (dashboardId, dashboards): StoreDashboard | undefined =>
    dashboardId !== null ? dashboards[dashboardId] : undefined,
);

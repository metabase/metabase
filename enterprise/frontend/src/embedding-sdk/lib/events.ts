import type { Dashboard } from "metabase-types/api";

export type SdkDashboardLoadEvent = (dashboard: Dashboard | null) => void;

export type SdkEventHandlersConfig = {
  onDashboardLoad?: SdkDashboardLoadEvent; // triggers when active tab loads with all cards in it
  onDashboardLoadWithoutCards?: SdkDashboardLoadEvent; // triggers when dashboard structure loads (list of tabs, grid of active tab)
};

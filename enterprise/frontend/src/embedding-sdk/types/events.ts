import type { Dashboard } from "metabase-types/api";

export type SdkDashboardLoadEvent = (dashboard: Dashboard | null) => void;

export type SdkEventHandlersConfig = {
  /**
   * Triggers when a dashboard loads with all visible cards and their content
   */
  onDashboardLoad?: SdkDashboardLoadEvent;

  /**
   * Triggers after a dashboard loads, but without its cards (at this stage only the dashboard title, tabs, and cards grid are rendered, but the contents of the cards have yet to load.
   */
  onDashboardLoadWithoutCards?: SdkDashboardLoadEvent;
};

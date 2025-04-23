import type { Dashboard } from "metabase-types/api";

export type PublicOrEmbeddedDashboardEventHandlersProps = {
  /**
   * Callback that is called when the dashboard is loaded.
   */
  onLoad?: (dashboard: Dashboard | null) => void;

  /**
   * Callback that is called when the dashboard is loaded without cards.
   */
  onLoadWithoutCards?: (dashboard: Dashboard | null) => void;
};

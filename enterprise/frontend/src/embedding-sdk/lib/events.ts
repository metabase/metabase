import type { Dashboard } from "metabase-types/api";

export type SdkDashboardLoadEvent = (dashboard: Dashboard | null) => void;

export type SdkEventHandlersConfig = {
  onDashboardLoad?: SdkDashboardLoadEvent;
  onDashboardLoadWithCards?: SdkDashboardLoadEvent;
};

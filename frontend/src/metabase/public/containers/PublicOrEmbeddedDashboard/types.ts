import type { Dashboard } from "metabase-types/api";

export type PublicOrEmbeddedDashboardEventHandlersProps = {
  onLoad?: (dashboard: Dashboard | null) => void;
  onLoadWithCards?: (dashboard: Dashboard | null) => void;
};

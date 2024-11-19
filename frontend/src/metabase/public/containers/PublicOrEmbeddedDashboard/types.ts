import type { Dashboard } from "metabase-types/api";

export type PublicOrEmbeddedDashboardEventHandlersProps = {
  onLoad?: (dashboard: Dashboard | null) => void;
  onLoadWithoutCards?: (dashboard: Dashboard | null) => void;
};

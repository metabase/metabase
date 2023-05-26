import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId } from "metabase-types/api";

export const trackAutoApplyFiltersDisabled = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", "1-0-1", {
    event: "auto_apply_filters_disabled",
    dashboard_id: dashboardId,
  });
};

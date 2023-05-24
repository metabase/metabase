import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackAutoApplyFiltersDisabled = (dashboardId: number) => {
  trackSchemaEvent("dashboard", "1-0-1", {
    event: "auto_apply_filters_disabled",
    dashboard_id: dashboardId,
  });
};

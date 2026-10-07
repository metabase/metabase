import { trackSchemaEvent, trackSimpleEvent } from "metabase/analytics";
import type { DashboardId } from "metabase-types/api";

export const trackStackedSeriesEnabled = () => {
  trackSimpleEvent({
    event: "stack_series_enabled",
    triggered_from: "viz_settings",
  });
};

export const trackCardSetToHideWhenNoResults = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "card_set_to_hide_when_no_results",
    dashboard_id: typeof dashboardId === "number" ? dashboardId : 0,
  });
};

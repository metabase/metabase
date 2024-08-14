import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId } from "metabase-types/api";

export const trackCardSetToHideWhenNoResults = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", "1-1-1", {
    event: "card_set_to_hide_when_no_results",
    dashboard_id: dashboardId,
  });
};

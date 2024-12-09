import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId } from "metabase-types/api";

export const trackCardSetToHideWhenNoResults = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "card_set_to_hide_when_no_results",
    dashboard_id: typeof dashboardId === "number" ? dashboardId : 0,
  });
};

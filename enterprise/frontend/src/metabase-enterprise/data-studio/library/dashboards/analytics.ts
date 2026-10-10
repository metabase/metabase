import { trackSimpleEvent } from "metabase/analytics";
import type { DashboardId } from "metabase-types/api";

export function trackDataStudioDashboardCreated(dashboardId: DashboardId) {
  trackSimpleEvent({
    event: "data_studio_dashboard_created",
    target_id: Number(dashboardId),
  });
}

export function trackDataStudioDashboardEditStarted(dashboardId: DashboardId) {
  trackSimpleEvent({
    event: "data_studio_dashboard_edit_started",
    target_id: Number(dashboardId),
  });
}

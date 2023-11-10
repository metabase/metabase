import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId } from "metabase-types/api";

const DASHBOARD_SCHEMA_VERSION = "1-1-2";

export const trackAutoApplyFiltersDisabled = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "auto_apply_filters_disabled",
    dashboard_id: dashboardId,
  });
};

export const trackExportDashboardToPDF = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_pdf_exported",
    dashboard_id: dashboardId,
  });
};

type CardTypes = "text" | "heading" | "link" | "action";

export const trackCardCreated = (type: CardTypes, dashboard_id: number) => {
  if (!type) {
    return;
  }
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: `new_${type}_card_created`,
    dashboard_id,
  });
};

export const trackCardMoved = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: `card_moved_to_tab`,
    dashboard_id: dashboardId,
  });
};

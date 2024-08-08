import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId, DashboardWidth } from "metabase-types/api";

import type { SectionId } from "./sections";

const DASHBOARD_SCHEMA_VERSION = "1-1-5";

export const trackAutoApplyFiltersDisabled = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "auto_apply_filters_disabled",
    dashboard_id: dashboardId,
  });
};

export type DashboardAccessedVia =
  | "internal"
  | "public-link"
  | "static-embed"
  | "interactive-iframe-embed"
  | "sdk-embed";

export const trackExportDashboardToPDF = ({
  dashboardId,
  dashboardAccessedVia,
}: {
  dashboardId?: DashboardId;
  dashboardAccessedVia: DashboardAccessedVia;
}) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_pdf_exported",
    // We made dashboard_id optional because we don't want to send
    // UUIDs or JWTs when in public or static embed scenarios.
    // Because the field is still required in the snowplow table we send 0.
    dashboard_id: typeof dashboardId === "number" ? dashboardId : 0,
    dashboard_accessed_via: dashboardAccessedVia,
  });
};

export const trackDashboardWidthChange = (
  dashboardId: DashboardId,
  width: DashboardWidth,
) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_width_toggled",
    dashboard_id: dashboardId,
    full_width: width === "full",
  });
};

type CardTypes = "text" | "heading" | "link" | "action";

export const trackCardCreated = (
  type: CardTypes,
  dashboard_id: DashboardId,
) => {
  if (!type) {
    return;
  }
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: `new_${type}_card_created`,
    dashboard_id,
  });
};

export const trackSectionAdded = (
  dashboardId: DashboardId,
  sectionId: SectionId,
) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_section_added",
    dashboard_id: dashboardId,
    section_layout: sectionId,
  });
};

export const trackDashboardSaved = ({
  duration_milliseconds,
  dashboard_id,
}: {
  dashboard_id: number;
  duration_milliseconds: number;
}) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_saved",
    dashboard_id,
    duration_milliseconds,
  });
};

export const trackCardMoved = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: `card_moved_to_tab`,
    dashboard_id: dashboardId,
  });
};

export const trackQuestionReplaced = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_card_replaced",
    dashboard_id: dashboardId,
  });
};

export const trackDashcardDuplicated = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_card_duplicated",
    dashboard_id: dashboardId,
  });
};

export const trackTabDuplicated = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_tab_duplicated",
    dashboard_id: dashboardId,
  });
};

export const trackFilterRequired = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", DASHBOARD_SCHEMA_VERSION, {
    event: "dashboard_filter_required",
    dashboard_id: dashboardId,
  });
};

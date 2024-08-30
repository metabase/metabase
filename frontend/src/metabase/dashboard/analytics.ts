import { trackSchemaEvent } from "metabase/lib/analytics";
import type { DashboardId, DashboardWidth } from "metabase-types/api";

import type { SectionId } from "./sections";

const getDashboardId = (dashboardId: DashboardId) => {
  return typeof dashboardId === "number" ? dashboardId : 0;
};

export const trackAutoApplyFiltersDisabled = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "auto_apply_filters_disabled",
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackExportDashboardToPDF = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_pdf_exported",
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackDashboardWidthChange = (
  dashboardId: DashboardId,
  width: DashboardWidth,
) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_width_toggled",
    dashboard_id: getDashboardId(dashboardId),
    full_width: width === "full",
  });
};

type CardTypes = "text" | "heading" | "link" | "action";

export const trackCardCreated = (type: CardTypes, dashboardId: DashboardId) => {
  if (!type) {
    return;
  }
  trackSchemaEvent("dashboard", {
    event: `new_${type}_card_created`,
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackSectionAdded = (
  dashboardId: DashboardId,
  sectionId: SectionId,
) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_section_added",
    dashboard_id: getDashboardId(dashboardId),
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
  trackSchemaEvent("dashboard", {
    event: "dashboard_saved",
    dashboard_id,
    duration_milliseconds,
  });
};

export const trackCardMoved = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: `card_moved_to_tab`,
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackQuestionReplaced = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_card_replaced",
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackDashcardDuplicated = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_card_duplicated",
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackTabDuplicated = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_tab_duplicated",
    dashboard_id: getDashboardId(dashboardId),
  });
};

export const trackFilterRequired = (dashboardId: DashboardId) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_filter_required",
    dashboard_id: getDashboardId(dashboardId),
  });
};

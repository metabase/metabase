import { match } from "ts-pattern";

import { trackSchemaEvent, trackSimpleEvent } from "metabase/analytics";
import type { ExportFormat } from "metabase/common/types/export";
import type { DashboardId } from "metabase-types/api";

import type { ResourceAccessedVia, ResourceType } from "./store/downloads";
import type { RegularClickAction } from "./types";

const SCHEMA = "downloads";

// dashboard_id is required in the snowplow schema, but we don't send UUIDs or
// JWTs in public/static-embed scenarios, so fall back to 0 there.
const getTrackedDashboardId = (dashboardId: DashboardId | undefined) =>
  typeof dashboardId === "number" ? dashboardId : 0;

export const trackExportDashboardToPDF = ({
  dashboardId,
  dashboardAccessedVia,
}: {
  dashboardId?: DashboardId;
  dashboardAccessedVia: ResourceAccessedVia;
}) => {
  trackSchemaEvent("dashboard", {
    event: "dashboard_pdf_exported",
    dashboard_id: getTrackedDashboardId(dashboardId),
    dashboard_accessed_via: dashboardAccessedVia,
  });
};

export const trackDownloadResults = ({
  resourceType,
  accessedVia,
  exportType,
}: {
  resourceType: ResourceType;
  accessedVia: ResourceAccessedVia;
  exportType: ExportFormat;
}) => {
  // Map document-card to dashcard for analytics tracking since the schema
  // doesn't have a separate document-card type
  const analyticsResourceType =
    resourceType === "document-card" ? "dashcard" : resourceType;

  trackSchemaEvent(SCHEMA, {
    event: "download_results_clicked",
    resource_type: analyticsResourceType,
    accessed_via: accessedVia,
    export_type: exportType,
  });
};

export const trackClickActionPerformed = (action: RegularClickAction) => {
  trackSimpleEvent({
    event: "click_action",
    triggered_from: action.section,
  });

  if (action.section === "auto-popover") {
    const event = match(action.name)
      .with("automatic-insights.compare", () => "compare_to_rest" as const)
      .with("automatic-insights.xray", () => "x-ray" as const)
      .otherwise(() => "x-ray" as const);

    trackSimpleEvent({
      event: "x-ray_automatic_insights_clicked",
      event_detail: event,
    });
  }
};

export const trackStackedSeriesEnabled = () => {
  trackSimpleEvent({
    event: "stack_series_enabled",
    triggered_from: "viz_settings",
  });
};

export const trackTableFreezeColumnsEnabled = () => {
  trackSimpleEvent({
    event: "table_freeze_columns_enabled",
    triggered_from: "viz_settings",
  });
};

export const trackTableFreezeRowsEnabled = () => {
  trackSimpleEvent({
    event: "table_freeze_rows_enabled",
    triggered_from: "viz_settings",
  });
};

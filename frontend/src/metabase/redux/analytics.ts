import { trackSchemaEvent } from "metabase/analytics";
import type { DashboardId } from "metabase-types/api";

import type { ResourceAccessedVia, ResourceType } from "./downloads";

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
  exportType: string;
}) => {
  // Map document-card to dashcard for analytics tracking since the schema
  // doesn't have a separate document-card type
  const analyticsResourceType =
    resourceType === "document-card" ? "dashcard" : resourceType;

  trackSchemaEvent(SCHEMA, {
    event: "download_results_clicked",
    resource_type: analyticsResourceType,
    accessed_via: accessedVia,
    export_type: exportType as any,
  });
};

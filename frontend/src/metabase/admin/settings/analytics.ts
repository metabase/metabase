import { trackSchemaEvent, trackSimpleEvent } from "metabase/utils/analytics";

export const trackTrackingPermissionChanged = (isEnabled: boolean) => {
  trackSchemaEvent("settings", {
    event: isEnabled
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "admin",
  });
};

export const trackAnalyticsPiiRetentionChanged = (isEnabled: boolean) => {
  trackSimpleEvent({
    event: "analytics_pii_retention_changed",
    event_detail: isEnabled ? "enabled" : "disabled",
    triggered_from: "admin",
  });
};

export const trackCustomHomepageDashboardEnabled = (
  source: "admin" | "homepage",
) => {
  trackSchemaEvent("settings", {
    event: "homepage_dashboard_enabled",
    source,
  });
};

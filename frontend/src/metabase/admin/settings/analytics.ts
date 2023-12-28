import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackTrackingPermissionChanged = (isEnabled: boolean) => {
  trackSchemaEvent("settings", "1-0-1", {
    event: isEnabled
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "admin",
  });
};

export const trackCustomHomepageDashboardEnabled = (
  source: "admin" | "homepage",
) => {
  trackSchemaEvent("settings", "1-0-2", {
    event: "homepage_dashboard_enabled",
    source,
  });
};

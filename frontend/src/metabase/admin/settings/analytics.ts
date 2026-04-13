import { trackSchemaEvent } from "metabase/utils/analytics";

export const trackTrackingPermissionChanged = (isEnabled: boolean) => {
  trackSchemaEvent("settings", {
    event: isEnabled
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "admin",
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

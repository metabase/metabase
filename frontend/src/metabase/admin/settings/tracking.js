import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackTrackingPermissionChanged = isEnabled => {
  trackSchemaEvent("settings", "1-0-1", {
    event: isEnabled
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "admin",
  });
};

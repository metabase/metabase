export type TrackingPermissionEnabledEvent = {
  event: "tracking_permission_enabled";
  source: "setup" | "admin";
};

export type TrackingPermissionDisabledEvent = {
  event: "tracking_permission_disabled";
  source: "setup" | "admin";
};

export type HomepageDashboardEnabledEvent = {
  event: "homepage_dashboard_enabled";
  source: "admin" | "homepage";
};

export type SettingsEvent =
  | TrackingPermissionEnabledEvent
  | TrackingPermissionDisabledEvent
  | HomepageDashboardEnabledEvent;

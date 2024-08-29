type SettingsEventSchema = {
  event: string;
  source?: string | null;
};

type ValidateEvent<
  T extends SettingsEventSchema &
    Record<Exclude<keyof T, keyof SettingsEventSchema>, never>,
> = T;

export type TrackingPermissionEnabledEvent = ValidateEvent<{
  event: "tracking_permission_enabled";
  source: "setup" | "admin";
}>;

export type TrackingPermissionDisabledEvent = ValidateEvent<{
  event: "tracking_permission_disabled";
  source: "setup" | "admin";
}>;

export type HomepageDashboardEnabledEvent = ValidateEvent<{
  event: "homepage_dashboard_enabled";
  source: "admin" | "homepage";
}>;

export type SettingsEvent =
  | TrackingPermissionEnabledEvent
  | TrackingPermissionDisabledEvent
  | HomepageDashboardEnabledEvent;

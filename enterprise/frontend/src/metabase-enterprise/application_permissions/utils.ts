import type { User } from "metabase-types/api";
import type { AdminPathKey } from "metabase-types/store";

const canAccessMonitoringItems = (user?: User) =>
  user?.permissions?.can_access_monitoring ?? false;

const canAccessSettings = (user?: User) =>
  user?.permissions?.can_access_setting ?? false;

export const monitoringPermissionAllowedPathGetter = (
  user?: User,
): AdminPathKey[] => (canAccessMonitoringItems(user) ? ["tools"] : []);

export const settingsPermissionAllowedPathGetter = (
  user?: User,
): AdminPathKey[] => (canAccessSettings(user) ? ["settings"] : []);

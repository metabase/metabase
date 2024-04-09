import type { AdminPathKey } from "metabase-types/store";

import type { UserWithApplicationPermissions } from "./types/user";

const canAccessMonitoringItems = (user?: UserWithApplicationPermissions) =>
  user?.permissions?.can_access_monitoring ?? false;

const canAccessSettings = (user?: UserWithApplicationPermissions) =>
  user?.permissions?.can_access_setting ?? false;

export const monitoringPermissionAllowedPathGetter = (
  user?: UserWithApplicationPermissions,
): AdminPathKey[] =>
  canAccessMonitoringItems(user) ? ["audit", "tools", "troubleshooting"] : [];

export const settingsPermissionAllowedPathGetter = (
  user?: UserWithApplicationPermissions,
): AdminPathKey[] => (canAccessSettings(user) ? ["settings"] : []);

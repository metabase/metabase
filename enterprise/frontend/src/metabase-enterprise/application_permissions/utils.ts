import { UserWithApplicationPermissions } from "./types/user";

export const canAccessMonitoringItems = (
  user?: UserWithApplicationPermissions,
) => user?.permissions?.can_access_monitoring ?? false;

export const canAccessSettings = (user?: UserWithApplicationPermissions) =>
  user?.permissions?.can_access_setting ?? false;

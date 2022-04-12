import { UserWithGeneralPermissions } from "./types/user";

export const canAccessMonitoringItems = (user?: UserWithGeneralPermissions) =>
  user?.permissions?.can_access_monitoring ?? false;

export const canAccessSettings = (user?: UserWithGeneralPermissions) =>
  user?.permissions?.can_access_setting ?? false;

import { UserWithPermissions } from "./types/user";

export const canAccessMonitoringItems = (user?: UserWithPermissions) =>
  user?.permissions.can_access_monitoring ?? false;

import { UserWithFeaturePermissions } from "./types/user";

export const canAccessDataModel = (user?: UserWithFeaturePermissions) =>
  user?.permissions.can_access_data_model ?? false;

export const canAccessDatabaseManagement = (
  user?: UserWithFeaturePermissions,
) => user?.permissions.can_access_database_management ?? false;

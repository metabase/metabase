import { User } from "metabase-types/api";

export const canAccessSettings = (user: User) =>
  canAccessDataModel(user) || canAccessDatabaseManagement(user);

export const canAccessDataModel = (user?: User) =>
  user?.can_access_data_model ?? false;

export const canAccessDatabaseManagement = (user?: User) =>
  user?.can_access_database_management ?? false;

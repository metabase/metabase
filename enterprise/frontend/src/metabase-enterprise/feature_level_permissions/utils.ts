import { User } from "metabase-types/api";

export const canAccessSettings = (user: User) =>
  canAccessDataModel(user) || canAccessDatabaseManagement(user);

export const canAccessDataModel = ({ can_access_data_model }: User) =>
  can_access_data_model;

export const canAccessDatabaseManagement = ({
  can_access_database_management,
}: User) => true;

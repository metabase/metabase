import { t } from "ttag";

import type { PermissionSubject } from "metabase/admin/permissions/types";
import { getUser } from "metabase/selectors/user";
import type { AdminPathKey, State } from "metabase-types/store";

import type { UserWithFeaturePermissions } from "./types/user";

const canUserAccessDataModel = (user?: UserWithFeaturePermissions) =>
  user?.permissions?.can_access_data_model ?? false;

const canUserAccessDatabaseManagement = (user?: UserWithFeaturePermissions) =>
  user?.permissions?.can_access_db_details ?? false;

export const canAccessDataModel = (state: State): boolean => {
  const user = getUser(state);
  return user != null && canUserAccessDataModel(user);
};

export const dataModelPermissionAllowedPathGetter = (
  user?: UserWithFeaturePermissions,
): AdminPathKey[] => {
  return canUserAccessDataModel(user) ? ["data-model"] : [];
};

export const databaseManagementPermissionAllowedPathGetter = (
  user?: UserWithFeaturePermissions,
): AdminPathKey[] => {
  return canUserAccessDatabaseManagement(user) ? ["databases"] : [];
};

export const getDataColumns = (subject: PermissionSubject) => {
  const allSubjectsColumns = [
    {
      name: t`Download results`,
      hint: t`Downloads of native queries are only allowed if a group has download permissions for the entire database.`,
    },
    {
      name: t`Manage table metadata`,
    },
  ];

  if (subject === "schemas") {
    allSubjectsColumns.push({
      name: t`Manage database`,
    });
  }

  return allSubjectsColumns;
};

import { t } from "ttag";

import type { PermissionSubject } from "metabase/admin/permissions/types";
import type { AdminPathKey } from "metabase-types/store";

import type { UserWithFeaturePermissions } from "./types/user";

const canAccessDataModel = (user?: UserWithFeaturePermissions) =>
  user?.permissions?.can_access_data_model ?? false;

const canAccessDatabaseManagement = (user?: UserWithFeaturePermissions) =>
  user?.permissions?.can_access_db_details ?? false;

export const dataModelPermissionAllowedPathGetter = (
  user?: UserWithFeaturePermissions,
): AdminPathKey[] => {
  return canAccessDataModel(user) ? ["data-model"] : [];
};

export const databaseManagementPermissionAllowedPathGetter = (
  user?: UserWithFeaturePermissions,
): AdminPathKey[] => {
  return canAccessDatabaseManagement(user) ? ["databases"] : [];
};

export const getDataColumns = (
  subject: PermissionSubject,
  isExternal?: boolean,
) => {
  const allSubjectsColumns: { name: string; hint?: string }[] = [
    {
      name: t`Download results`,
      hint: t`Downloads of native queries are only allowed if a group has download permissions for the entire database.`,
    },
  ];

  if (!isExternal) {
    allSubjectsColumns.push({
      name: t`Manage table metadata`,
    });
  }

  if (subject === "schemas" && !isExternal) {
    allSubjectsColumns.push({
      name: t`Manage database`,
    });
  }

  return allSubjectsColumns;
};

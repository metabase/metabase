import { t } from "ttag";

import type { PermissionSubject } from "metabase/admin/permissions/types";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";
import type { AdminPathKey, State } from "metabase-types/store";

const canUserAccessDataModel = (user?: User) =>
  user?.permissions?.can_access_data_model ?? false;

const canUserAccessDatabaseManagement = (user?: User) =>
  user?.permissions?.can_access_db_details ?? false;

export const canAccessDataModel = (state: State): boolean => {
  const user = getUser(state);
  return user != null && canUserAccessDataModel(user);
};

export const dataModelPermissionAllowedPathGetter = (
  user?: User,
): AdminPathKey[] => {
  return canUserAccessDataModel(user) ? ["data-model"] : [];
};

export const databaseManagementPermissionAllowedPathGetter = (
  user?: User,
): AdminPathKey[] => {
  return canUserAccessDatabaseManagement(user) ? ["databases"] : [];
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

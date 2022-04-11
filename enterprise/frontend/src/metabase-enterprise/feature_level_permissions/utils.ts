import { t } from "ttag";
import { PermissionSubject } from "metabase/admin/permissions/types";
import { UserWithFeaturePermissions } from "./types/user";

export const canAccessDataModel = (user?: UserWithFeaturePermissions) =>
  user?.permissions?.can_access_data_model ?? false;

export const canAccessDatabaseManagement = (
  user?: UserWithFeaturePermissions,
) => user?.permissions?.can_access_db_details ?? false;

export const getDataColumns = (subject: PermissionSubject) => {
  const allSubjectsColumns = [
    {
      name: t`Download results`,
      hint: t`If you grant someone permissions to download data from a database, you won't be able to schema or table level for native queries.`,
    },
    {
      name: t`Manage data model`,
    },
  ];

  if (subject === "schemas") {
    allSubjectsColumns.push({
      name: t`Manage database`,
    });
  }

  return allSubjectsColumns;
};

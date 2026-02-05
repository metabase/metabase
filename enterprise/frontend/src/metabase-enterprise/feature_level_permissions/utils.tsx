import type { ReactNode } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import type {
  PermissionSubject,
  SpecialGroupType,
} from "metabase/admin/permissions/types";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
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

export const getDataColumns = ({
  subject,
  groupType,
  isExternal,
  transformsEnabled,
}: {
  subject: PermissionSubject;
  groupType?: SpecialGroupType;
  isExternal?: boolean;
  transformsEnabled?: boolean;
}) => {
  const allSubjectsColumns: { name: string; hint?: ReactNode }[] = [
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

    if (PLUGIN_TRANSFORMS.isEnabled && transformsEnabled) {
      allSubjectsColumns.push({
        name: t`Transforms`,
        hint:
          groupType === "analyst" || groupType === "admin"
            ? null
            : jt`Users must also be a member of the ${(
                <Link
                  key="link"
                  to="/admin/people"
                  style={{ textDecoration: "underline" }}
                >{t`Data Analysts group`}</Link>
              )} to use transforms.`,
      });
    }
  }

  return allSubjectsColumns;
};

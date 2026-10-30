import type { ReactNode } from "react";
import { t } from "ttag";

import { getUser } from "metabase/current-user";
import type { AdminPathKey, State } from "metabase/redux/store";
import type {
  PermissionSubject,
  SpecialGroupType,
  User,
} from "metabase-types/api";

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

// PROTOTYPE: "Manage table metadata", "Manage database", and "Transforms" no
// longer appear in the data permissions grid. Table metadata and transforms
// are described and configured on the Data Analysts role page instead. Keep in
// step with `getFeatureLevelDataPermissions`, which builds the matching cells.
export const getDataColumns = (_options: {
  subject: PermissionSubject;
  groupType?: SpecialGroupType;
  isExternal?: boolean;
  showTransformPermissions?: boolean;
}): { name: string; hint?: ReactNode }[] => [
  {
    name: t`Download results`,
    hint: t`Downloads of native queries are only allowed if a group has download permissions for the entire database.`,
  },
];

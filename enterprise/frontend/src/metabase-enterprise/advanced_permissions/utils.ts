import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import type { GroupId, PermissionEntityId } from "metabase-types/api";

import type { ImpersonationModalParams } from "./types";

export const getImpersonatedDatabaseId = ({
  databaseId,
  impersonatedDatabaseId,
}: ImpersonationModalParams) => {
  if (databaseId != null) {
    return parseInt(databaseId);
  }
  if (impersonatedDatabaseId != null) {
    return parseInt(impersonatedDatabaseId);
  }

  throw new Error("Missing database id");
};

const getDatabaseViewImpersonationModalUrl = (
  entityId: PermissionEntityId,
  groupId: GroupId,
) => {
  const baseUrl = getDatabaseFocusPermissionsUrl(entityId);
  return `${baseUrl}/impersonated/group/${groupId}`;
};

const getGroupViewImpersonationModalUrl = (
  entityId: PermissionEntityId,
  groupId: GroupId,
) => {
  const baseUrl = getGroupFocusPermissionsUrl(groupId);

  return `${baseUrl}/impersonated/database/${entityId.databaseId}`;
};

export const getEditImpersonationUrl = (
  entityId: PermissionEntityId,
  groupId: GroupId,
  view: "database" | "group",
) =>
  view === "database"
    ? getDatabaseViewImpersonationModalUrl(entityId, groupId)
    : getGroupViewImpersonationModalUrl(entityId, groupId);

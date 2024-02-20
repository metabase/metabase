import type { EntityId } from "metabase/admin/permissions/types";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import type { GroupId, Impersonation } from "metabase-types/api";

import type { ImpersonationModalParams } from "./types";

export const getImpersonationKey = (impersonation: Impersonation) =>
  `${impersonation.db_id}:${impersonation.group_id}`;

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
  entityId: EntityId,
  groupId: GroupId,
) => {
  const baseUrl = getDatabaseFocusPermissionsUrl(entityId);
  return `${baseUrl}/impersonated/group/${groupId}`;
};

const getGroupViewImpersonationModalUrl = (
  entityId: EntityId,
  groupId: GroupId,
) => {
  const baseUrl = getGroupFocusPermissionsUrl(groupId);

  return `${baseUrl}/impersonated/database/${entityId.databaseId}`;
};

export const getEditImpersonationUrl = (
  entityId: EntityId,
  groupId: GroupId,
  view: "database" | "group",
) =>
  view === "database"
    ? getDatabaseViewImpersonationModalUrl(entityId, groupId)
    : getGroupViewImpersonationModalUrl(entityId, groupId);

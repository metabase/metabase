import type {
  DataPermissionValue,
  EntityId,
  PermissionSubject,
} from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { buildDataModelPermission } from "./data-model-permission";
import { buildDetailsPermission } from "./details-permission";
import { buildDownloadPermission } from "./download-permission";

export const getFeatureLevelDataPermissions = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  isExternal: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: DataPermissionValue,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
  permissionView?: "group" | "database",
) => {
  const downloadPermission = buildDownloadPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    dataAccessPermissionValue,
    defaultGroup,
    permissionSubject,
  );

  const dataModelPermission =
    (!isExternal || permissionView === "database") &&
    buildDataModelPermission(
      entityId,
      groupId,
      isAdmin,
      isExternal,
      permissions,
      defaultGroup,
      permissionSubject,
    );

  const detailsPermission =
    (!isExternal || permissionView === "database") &&
    buildDetailsPermission(
      entityId,
      groupId,
      isAdmin,
      isExternal,
      permissions,
      defaultGroup,
      permissionSubject,
    );

  return [downloadPermission, dataModelPermission, detailsPermission].filter(
    Boolean,
  );
};

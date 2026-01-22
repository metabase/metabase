import type {
  DataPermissionValue,
  EntityId,
  PermissionSubject,
  SpecialGroupType,
} from "metabase/admin/permissions/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { buildDataModelPermission } from "./data-model-permission";
import { buildDetailsPermission } from "./details-permission";
import { buildDownloadPermission } from "./download-permission";

export const getFeatureLevelDataPermissions = (
  entityId: EntityId,
  groupId: number,
  groupType: SpecialGroupType,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: DataPermissionValue,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
  permissionView?: "group" | "database",
) => {
  const isAdmin = groupType === "admin";
  const isExternal = groupType === "external";

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
      groupType,
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

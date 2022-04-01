import { GroupsPermissions } from "metabase-types/api";
import { EntityId, PermissionSubject } from "metabase/admin/permissions/types";
import { buildDataModelPermission } from "./data-model-permission";
import { buildDownloadPermission } from "./download-permission";

export const getFeatureLevelDataPermissions = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: string,
  permissionSubject: PermissionSubject,
) => {
  const downloadPermission = buildDownloadPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    dataAccessPermissionValue,
    permissionSubject,
  );

  const dataModelPermission = buildDataModelPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    dataAccessPermissionValue,
    permissionSubject,
  );

  return [downloadPermission, dataModelPermission];
};

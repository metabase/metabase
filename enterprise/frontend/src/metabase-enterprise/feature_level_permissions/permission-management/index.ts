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
  permissions: GroupsPermissions,
  dataAccessPermissionValue: DataPermissionValue,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
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

  const dataModelPermission = buildDataModelPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    defaultGroup,
    permissionSubject,
  );

  const detailsPermission = buildDetailsPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    defaultGroup,
    permissionSubject,
  );

  return [downloadPermission, dataModelPermission, detailsPermission].filter(
    Boolean,
  );
};

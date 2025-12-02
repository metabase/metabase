import type {
  DataPermissionValue,
  EntityId,
  PermissionSectionConfig,
  PermissionSubject,
} from "metabase/admin/permissions/types";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { buildDataModelPermission } from "./data-model-permission";
import { buildDetailsPermission } from "./details-permission";
import { buildDownloadPermission } from "./download-permission";
import { buildTransformsPermission } from "./transforms-permission";

export const getFeatureLevelDataPermissions = (
  entityId: EntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  dataAccessPermissionValue: DataPermissionValue,
  defaultGroup: Group,
  permissionSubject: PermissionSubject,
): PermissionSectionConfig[] => {
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

  const transformsPermission = PLUGIN_TRANSFORMS.isEnabled
    ? buildTransformsPermission(
        entityId,
        groupId,
        isAdmin,
        permissions,
        defaultGroup,
        permissionSubject,
      )
    : null;

  return [
    downloadPermission,
    dataModelPermission,
    detailsPermission,
    transformsPermission,
  ].filter(isNotNull);
};

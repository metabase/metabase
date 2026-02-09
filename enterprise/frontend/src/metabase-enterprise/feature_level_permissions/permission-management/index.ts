import type {
  DataPermissionValue,
  EntityId,
  PermissionSectionConfig,
  PermissionSubject,
  SpecialGroupType,
} from "metabase/admin/permissions/types";
import { isNotNull } from "metabase/lib/types";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { buildDataModelPermission } from "./data-model-permission";
import { buildDetailsPermission } from "./details-permission";
import { buildDownloadPermission } from "./download-permission";
import { buildTransformsPermission } from "./transforms-permission";

export const getFeatureLevelDataPermissions = ({
  entityId,
  groupId,
  groupType,
  permissions,
  dataAccessPermissionValue,
  defaultGroup,
  permissionSubject,
  permissionView,
  showTransformPermissions = false,
}: {
  entityId: EntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  dataAccessPermissionValue: DataPermissionValue;
  defaultGroup: Group;
  permissionSubject: PermissionSubject;
  permissionView?: "group" | "database";
  showTransformPermissions?: boolean;
}): PermissionSectionConfig[] => {
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
    !isExternal || permissionView === "database"
      ? buildDataModelPermission(
          entityId,
          groupId,
          groupType,
          permissions,
          defaultGroup,
          permissionSubject,
        )
      : null;

  const detailsPermission =
    !isExternal || permissionView === "database"
      ? buildDetailsPermission(
          entityId,
          groupId,
          isAdmin,
          isExternal,
          permissions,
          defaultGroup,
          permissionSubject,
        )
      : null;

  const transformsPermission = showTransformPermissions
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

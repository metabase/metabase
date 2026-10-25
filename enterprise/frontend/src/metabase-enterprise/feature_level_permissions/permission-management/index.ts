import type { PermissionSectionConfig } from "metabase/permissions";
import type {
  PermissionEntityId,
  PermissionSubject,
  SpecialGroupType,
} from "metabase/plugins";
import { isNotNull } from "metabase/utils/types";
import type {
  DataPermissionValue,
  GroupInfo,
  GroupsPermissions,
} from "metabase-types/api";

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
  entityId: PermissionEntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  dataAccessPermissionValue: DataPermissionValue;
  defaultGroup: GroupInfo;
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

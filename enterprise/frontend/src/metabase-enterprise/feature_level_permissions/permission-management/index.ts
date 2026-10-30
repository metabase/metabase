import type { PermissionSectionConfig } from "metabase/permissions";
import { isNotNull } from "metabase/utils/types";
import type {
  DataPermissionValue,
  Group,
  GroupsPermissions,
  PermissionEntityId,
  PermissionSubject,
  SpecialGroupType,
} from "metabase-types/api";

import { buildDownloadPermission } from "./download-permission";

// PROTOTYPE: only the download cell remains in the grid; see `getDataColumns`.
// Table metadata, database management, and transforms moved off the grid.
export const getFeatureLevelDataPermissions = ({
  entityId,
  groupId,
  groupType,
  permissions,
  dataAccessPermissionValue,
  defaultGroup,
  permissionSubject,
}: {
  entityId: PermissionEntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  dataAccessPermissionValue: DataPermissionValue;
  defaultGroup: Group;
  permissionSubject: PermissionSubject;
  permissionView?: "group" | "database";
  showTransformPermissions?: boolean;
}): PermissionSectionConfig[] =>
  [
    buildDownloadPermission(
      entityId,
      groupId,
      groupType === "admin",
      permissions,
      dataAccessPermissionValue,
      defaultGroup,
      permissionSubject,
    ),
  ].filter(isNotNull);

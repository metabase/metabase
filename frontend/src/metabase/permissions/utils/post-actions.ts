import {
  PLUGIN_ADVANCED_PERMISSIONS,
  type PermissionEntityId,
  type PostActionFunction,
} from "metabase/plugins";
import { navigate } from "metabase/router";
import {
  DataPermission,
  DataPermissionType,
  type DataPermissionValue,
  type GroupId,
} from "metabase-types/api";

import { getGroupFocusPermissionsUrl } from "./urls";

export const navigateToGranularPermissions = (
  groupId: GroupId,
  entityId: PermissionEntityId,
) => navigate(getGroupFocusPermissionsUrl(groupId, entityId));

export const limitDatabasePermission =
  (
    groupId: GroupId,
    entityId: PermissionEntityId,
    accessPermissionValue: DataPermissionValue,
  ): PostActionFunction =>
  (_entityId, _groupId, _view, applyUpdate) => {
    const value =
      PLUGIN_ADVANCED_PERMISSIONS.getDatabaseLimitedAccessPermission(
        accessPermissionValue,
      );

    if (value) {
      applyUpdate({
        groupId,
        entityId,
        type: DataPermissionType.ACCESS,
        permission: DataPermission.VIEW_DATA,
        value,
      });
    }

    navigateToGranularPermissions(groupId, entityId);
  };

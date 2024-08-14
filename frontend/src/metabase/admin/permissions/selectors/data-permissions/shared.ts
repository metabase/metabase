import {
  NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  UNABLE_TO_CHANGE_LEGACY_PERMISSIONS,
} from "metabase/admin/permissions/constants/messages";
import { isRestrictivePermission } from "metabase/admin/permissions/utils/graph";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

import { DataPermissionValue } from "../../types";

export const getNativePermissionDisabledTooltip = (
  isAdmin: boolean,
  accessPermissionValue: DataPermissionValue,
) => {
  if (isAdmin) {
    return UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  // prevent tooltip from being disabled when the user can't modify the view data column
  if (!PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn) {
    return null;
  }

  if (accessPermissionValue === DataPermissionValue.LEGACY_NO_SELF_SERVICE) {
    return UNABLE_TO_CHANGE_LEGACY_PERMISSIONS;
  }

  if (isRestrictivePermission(accessPermissionValue)) {
    return NATIVE_PERMISSION_REQUIRES_DATA_ACCESS;
  }

  return null;
};

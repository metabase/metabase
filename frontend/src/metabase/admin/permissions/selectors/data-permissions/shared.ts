import {
  NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  UNABLE_TO_CHANGE_LEGACY_PERMISSIONS,
} from "metabase/admin/permissions/constants/messages";
import { isRestrictivePermission } from "metabase/admin/permissions/utils/graph";

import { DataPermissionValue } from "../../types";

export const getNativePermissionDisabledTooltip = (
  isAdmin: boolean,
  accessPermissionValue: DataPermissionValue,
) => {
  if (isAdmin) {
    return UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  if (accessPermissionValue === DataPermissionValue.LEGACY_NO_SELF_SERVICE) {
    return UNABLE_TO_CHANGE_LEGACY_PERMISSIONS;
  }

  if (isRestrictivePermission(accessPermissionValue)) {
    return NATIVE_PERMISSION_REQUIRES_DATA_ACCESS;
  }

  return null;
};

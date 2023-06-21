import {
  NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "metabase/admin/permissions/constants/messages";
import { isRestrictivePermission } from "metabase/admin/permissions/utils/graph";

export const getNativePermissionDisabledTooltip = (
  isAdmin: boolean,
  accessPermissionValue: string,
) => {
  if (isAdmin) {
    return UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  if (isRestrictivePermission(accessPermissionValue)) {
    return NATIVE_PERMISSION_REQUIRES_DATA_ACCESS;
  }
  return null;
};

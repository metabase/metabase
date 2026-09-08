import { DataPermissionValue } from "metabase-types/api";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

export const isRestrictivePermission = (value: DataPermissionValue) =>
  value === DataPermissionValue.NO ||
  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission(value);

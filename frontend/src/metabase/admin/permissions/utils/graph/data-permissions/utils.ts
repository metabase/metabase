import _ from "underscore";

import { DataPermissionValue } from "metabase/admin/permissions/types";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

export const isRestrictivePermission = (value: DataPermissionValue) =>
  value === DataPermissionValue.NO ||
  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission(value);

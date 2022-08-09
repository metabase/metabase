import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

const BLOCK_PERMISSION_OPTION = {
  label: t`Block`,
  value: "block",
  icon: "close",
  iconColor: "danger",
};

if (hasPremiumFeature("advanced_permissions")) {
  const addBlockPermissionWhenSelected = (options, value) =>
    value === BLOCK_PERMISSION_OPTION.value
      ? [...options, BLOCK_PERMISSION_OPTION]
      : options;

  PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions =
    addBlockPermissionWhenSelected;
  PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions =
    addBlockPermissionWhenSelected;
  PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions = options => [
    ...options,
    BLOCK_PERMISSION_OPTION,
  ];
  PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission = value =>
    value === BLOCK_PERMISSION_OPTION.value;
}

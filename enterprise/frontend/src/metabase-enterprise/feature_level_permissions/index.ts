import { permissionOptionsToIconPaths } from "metabase/admin/permissions/utils/icons";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_PERMISSIONS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getFeatureLevelDataPermissions } from "./permission-management";
import { DOWNLOAD_PERMISSION_OPTIONS } from "./permission-management/download-permission";
import {
  canDownloadResults,
  getDownloadWidgetMessageOverride,
} from "./query-downloads";
import {
  dataModelPermissionAllowedPathGetter,
  databaseManagementPermissionAllowedPathGetter,
  getDataColumns,
} from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(dataModelPermissionAllowedPathGetter);
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
    databaseManagementPermissionAllowedPathGetter,
  );

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions =
    getFeatureLevelDataPermissions;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns = getDataColumns;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride =
    getDownloadWidgetMessageOverride;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults = canDownloadResults;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps = {
    include_editable_data_model: true,
  };

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps = {
    exclude_uneditable_details: true,
  };

  PLUGIN_PERMISSIONS.permissionIconPaths = {
    ...PLUGIN_PERMISSIONS.permissionIconPaths,
    ...permissionOptionsToIconPaths(DOWNLOAD_PERMISSION_OPTIONS),
  };
}

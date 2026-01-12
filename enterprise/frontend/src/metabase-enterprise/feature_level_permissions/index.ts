import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getFeatureLevelDataPermissions } from "./permission-management";
import {
  canDownloadResults,
  getDownloadWidgetMessageOverride,
} from "./query-downloads";
import {
  canAccessDataModel,
  dataModelPermissionAllowedPathGetter,
  databaseManagementPermissionAllowedPathGetter,
  getDataColumns,
} from "./utils";

/**
 * Initialize feature level permissions plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel = canAccessDataModel;
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
      dataModelPermissionAllowedPathGetter,
    );
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
  }
}

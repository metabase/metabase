import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import { DATA_PERMISSIONS_TOOLBAR_CONTENT } from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { NAV_PERMISSION_GUARD } from "metabase/nav/utils";

import { getFeatureLevelDataPermissions } from "./permission-management";
import {
  canDownloadResults,
  getDownloadWidgetMessageOverride,
} from "./query-downloads";
import {
  canAccessDataModel,
  canAccessDatabaseManagement,
  getDataColumns,
} from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  NAV_PERMISSION_GUARD["data-model"] = canAccessDataModel;
  NAV_PERMISSION_GUARD["databases"] = canAccessDatabaseManagement;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions = getFeatureLevelDataPermissions;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns = getDataColumns;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride = getDownloadWidgetMessageOverride;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults = canDownloadResults;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.tableMetadataQueryProps = {
    exclude_uneditable: true,
  };

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDataModelQueryProps = {
    exclude_uneditable_data_model: true,
  };

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps = {
    exclude_uneditable_details: true,
  };

  DATA_PERMISSIONS_TOOLBAR_CONTENT.length = 0;
}

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { canAccessDataModel, canAccessDatabaseManagement } from "./utils";

import { getFeatureLevelDataPermissions } from "./permission-management";
import { DATA_COLUMNS } from "./constants";
import {
  canDownloadResults,
  getDownloadWidgetMessageOverride,
} from "./query-downloads";
import { NAV_PERMISSION_GUARD } from "metabase/nav/utils";

if (hasPremiumFeature("advanced_permissions")) {
  NAV_PERMISSION_GUARD["data-model"] = canAccessDataModel;
  NAV_PERMISSION_GUARD["databases"] = canAccessDatabaseManagement;

  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions = getFeatureLevelDataPermissions;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataColumns = DATA_COLUMNS;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride = getDownloadWidgetMessageOverride;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults = canDownloadResults;
}

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  canAccessSettings,
  canAccessDataModel,
  canAccessDatabaseManagement,
} from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessSettings = canAccessSettings;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel = canAccessDataModel;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDatabaseManagement = canAccessDatabaseManagement;
}

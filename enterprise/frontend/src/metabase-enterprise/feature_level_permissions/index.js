import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import { getFeatureLevelDataPermissions } from "./permissions";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions = getFeatureLevelDataPermissions;
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataColumns = [t`Download results`];
}

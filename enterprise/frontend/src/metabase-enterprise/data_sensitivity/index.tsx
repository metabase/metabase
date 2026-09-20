import { PLUGIN_DATA_SENSITIVITY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataSensitivitySection } from "./DataSensitivitySection";

export function initializePlugin() {
  if (hasPremiumFeature("data_sensitivity")) {
    PLUGIN_DATA_SENSITIVITY.DatabaseSection = DataSensitivitySection;
  }
}

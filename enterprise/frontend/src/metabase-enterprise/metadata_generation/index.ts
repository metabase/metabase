import { PLUGIN_METADATA_GENERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { GenerateMetadataButton } from "./components/GenerateMetadataButton";
import { TableButton } from "./components/TableButton";

export function initializePlugin() {
  if (hasPremiumFeature("data_sensitivity")) {
    PLUGIN_METADATA_GENERATION.isEnabled = true;
    PLUGIN_METADATA_GENERATION.DatabaseButton = GenerateMetadataButton;
    PLUGIN_METADATA_GENERATION.TableButton = TableButton;
  }
}

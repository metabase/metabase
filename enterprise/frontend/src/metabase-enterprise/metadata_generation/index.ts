import { PLUGIN_METADATA_GENERATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabasePane } from "./components/DatabasePane";
import { TableButton } from "./components/TableButton";

export function initializePlugin() {
  if (hasPremiumFeature("data_sensitivity")) {
    PLUGIN_METADATA_GENERATION.isEnabled = true;
    PLUGIN_METADATA_GENERATION.DatabasePane = DatabasePane;
    PLUGIN_METADATA_GENERATION.TableButton = TableButton;
  }
}

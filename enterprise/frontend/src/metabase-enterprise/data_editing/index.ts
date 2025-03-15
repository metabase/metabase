import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { isDatabaseTableEditingEnabled } from "./settings";
import { TableDataContainer } from "./tables";

if (hasPremiumFeature("table_data_editing")) {
  PLUGIN_DATA_EDITING.isEnabled = () => true;
  PLUGIN_DATA_EDITING.isDatabaseTableEditingEnabled =
    isDatabaseTableEditingEnabled;
  PLUGIN_DATA_EDITING.PAGE_COMPONENT = TableDataContainer;
}

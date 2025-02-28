import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TableDataContainer } from "./tables";

if (hasPremiumFeature("data_editing")) {
  PLUGIN_DATA_EDITING.isEnabled = () => true;
  PLUGIN_DATA_EDITING.PAGE_COMPONENT = TableDataContainer;
}

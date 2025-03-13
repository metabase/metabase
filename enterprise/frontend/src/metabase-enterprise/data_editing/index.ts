import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { hasDatabaseTableEditingEnabled } from "./settings";
import { TableDataContainer } from "./tables/edit";
import { BrowseTableData } from "./tables/view";

if (hasPremiumFeature("table_data_editing")) {
  PLUGIN_DATA_EDITING.isEnabled = () => true;
  PLUGIN_DATA_EDITING.hasDatabaseTableEditingEnabled =
    hasDatabaseTableEditingEnabled;
  PLUGIN_DATA_EDITING.VIEW_PAGE_COMPONENT = BrowseTableData;
  PLUGIN_DATA_EDITING.EDIT_PAGE_COMPONENT = TableDataContainer;
}

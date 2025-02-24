import { PLUGIN_DATA_EDITING } from "metabase/plugins";
// import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TableDataView } from "./tables";

// TODO: enable this check after this feature token is added on the BE
// if (hasPremiumFeature("data_editing")) {
PLUGIN_DATA_EDITING.isEnabled = () => true;
PLUGIN_DATA_EDITING.PAGE_COMPONENT = TableDataView;
// }

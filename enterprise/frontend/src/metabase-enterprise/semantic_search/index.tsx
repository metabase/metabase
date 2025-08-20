import { PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SearchSettingsWidget } from "./SearchSettingsWidget";

if (hasPremiumFeature("semantic_search")) {
  PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget = SearchSettingsWidget;
}

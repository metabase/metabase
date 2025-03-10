import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";

// TODO: double check on name, it's hyphenated in the notion doc
// TODO: get this feature enabled / working
if (!!true || hasPremiumFeature("database_routing")) {
  PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;
}

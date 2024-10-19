import { PLUGIN_METABOT, PLUGIN_REDUCERS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { Metabot } from "./Metabot";
import { metabotReducer } from "./state";

if (!!true || hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.Metabot = Metabot;
  PLUGIN_REDUCERS.metabotPlugin = metabotReducer;
}

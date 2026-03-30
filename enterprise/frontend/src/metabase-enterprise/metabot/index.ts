import { PLUGIN_METABOT } from "metabase/plugins";

import { MetabaseAIProviderSetup } from "./components/MetabotAdmin/MetabaseAIProviderSetup";

export function initializePlugin() {
  // TODO
  // if (hasPremiumFeature("metabot_v3")) {
  PLUGIN_METABOT.MetabaseAIProviderSetup = MetabaseAIProviderSetup;
  // }
}

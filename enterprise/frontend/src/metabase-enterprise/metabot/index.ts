import { PLUGIN_METABOT } from "metabase/plugins";

import { MetabaseAIProviderSetup } from "./components/MetabotAdmin/MetabaseAIProviderSetup";

export function initializePlugin() {
  PLUGIN_METABOT.MetabaseAIProviderSetup = MetabaseAIProviderSetup;
}

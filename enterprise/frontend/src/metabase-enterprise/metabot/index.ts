import { PLUGIN_METABOT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  MetabaseAIProviderSetup,
  hasMetabaseManagedProviderDetails,
} from "./components/MetabotAdmin/MetabaseAIProviderSetup";
import { ProviderFallbackSettings } from "./components/MetabotAdmin/ProviderFallbackSettings";

export function initializePlugin() {
  if (
    hasPremiumFeature("offer-metabase-ai-managed") ||
    hasPremiumFeature("metabase-ai-managed") ||
    hasPremiumFeature("metabot-v3")
  ) {
    PLUGIN_METABOT.isEnabled = true;
    PLUGIN_METABOT.MetabaseAIProviderSetup = MetabaseAIProviderSetup;
    PLUGIN_METABOT.hasMetabaseManagedProviderDetails =
      hasMetabaseManagedProviderDetails;
  }
  if (hasPremiumFeature("ai_controls")) {
    PLUGIN_METABOT.ProviderFallbackSettings = ProviderFallbackSettings;
  }
}

import { SimpleDataPicker } from "embedding-sdk/components/private/SimpleDataPicker";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("embedding_sdk")) {
  PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
}

/**
 * We can't gate this component behind a feature flag, because SDK users could
 * use the SDK without a valid license and doesn't contain any feature flags.
 */
PLUGIN_EMBEDDING_SDK.SimpleDataPicker = SimpleDataPicker;

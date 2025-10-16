import { PLUGIN_ANONYMOUS_EMBEDDING } from "metabase/plugins";

// TODO: uncomment when the feature name is known
// if (hasPremiumFeature("embedding_simple")) {
// eslint-disable-next-line no-constant-condition
if (true) {
  PLUGIN_ANONYMOUS_EMBEDDING.isFeatureEnabled = () => true;
}

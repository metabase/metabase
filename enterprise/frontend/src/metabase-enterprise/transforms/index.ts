import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformsUpsellPage } from "./upsells/pages/TransformsUpsellPage";

// transforms is not a regular plugin, but a set of addons - basic transforms + python transforms
export function initializePlugin() {
  PLUGIN_TRANSFORMS.TransformsUpsellPage = TransformsUpsellPage;
  PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms");
}

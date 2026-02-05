import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformsUpsellPage } from "./upsells/TransformsUpsellPage";

// transforms is not a regular plugin, but a set of addons - basic transforms + python transforms
export function initializePlugin() {
  PLUGIN_TRANSFORMS.TransformsUpsellPage = TransformsUpsellPage;

  if (hasPremiumFeature("transforms")) {
    PLUGIN_TRANSFORMS.isEnabled = true;
  } else {
    PLUGIN_TRANSFORMS.isEnabled = false;
  }
}

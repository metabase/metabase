import { PLUGIN_TRANSFORMS, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

// transforms is not a regular plugin, but a set of addons - basic transforms + python transforms
export function initializePlugin() {
  PLUGIN_TRANSFORMS.TransformsUpsellPage = lazyPluginComponent(() =>
    import("./upsells/pages/TransformsUpsellPage").then(
      ({ TransformsUpsellPage }) => TransformsUpsellPage,
    ),
  );
  PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms-basic");
}

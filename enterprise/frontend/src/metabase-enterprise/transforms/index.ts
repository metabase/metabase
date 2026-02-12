import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CloudPurchaseContent } from "./upsells/components/CloudPurchaseContent";
import { useTransformsBilling } from "./upsells/hooks";
import { TransformsUpsellPage } from "./upsells/pages/TransformsUpsellPage";

// transforms is not a regular plugin, but a set of addons - basic transforms + python transforms
export function initializePlugin() {
  PLUGIN_TRANSFORMS.TransformsUpsellPage = TransformsUpsellPage;
  PLUGIN_TRANSFORMS.useTransformsBilling = useTransformsBilling;
  PLUGIN_TRANSFORMS.CloudPurchaseContent = CloudPurchaseContent;

  PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms");
}

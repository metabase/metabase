import { hasPremiumFeature } from "metabase-enterprise/settings";
import { updateColors } from "metabase-enterprise/whitelabel/lib/whitelabel";

if (hasPremiumFeature("whitelabel")) {
  updateColors();
}

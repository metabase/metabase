import { hasPremiumFeature } from "metabase-enterprise/settings";
import { updateColors } from "metabase-enterprise/whitelabel/lib/whitelabel";

export function applyWhitelabelOverride() {
  if (hasPremiumFeature("whitelabel")) {
    updateColors();
  }
}

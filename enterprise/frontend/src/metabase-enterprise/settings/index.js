import MetabaseSettings from "metabase/lib/settings";
import { hasAnySsoFeature } from "metabase/common/utils/plan";

export function hasPremiumFeature(feature) {
  const hasFeature = MetabaseSettings.get("token-features", {})?.[feature];
  if (hasFeature == null) {
    console.warn("Unknown premium feature", feature);
  }
  return hasFeature;
}

export function hasAnySsoPremiumFeature() {
  return hasAnySsoFeature(MetabaseSettings.get("token-features"));
}

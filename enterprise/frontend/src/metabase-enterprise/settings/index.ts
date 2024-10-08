import { hasAnySsoFeature } from "metabase/common/utils/plan";
import MetabaseSettings from "metabase/lib/settings";
import type { TokenFeature } from "metabase-types/api";

export function hasPremiumFeature(feature: TokenFeature) {
  const hasFeature = MetabaseSettings.get("token-features")?.[feature];
  if (hasFeature == null) {
    console.warn("Unknown premium feature", feature);
    throw `Unknown premium feature ${feature}`;
  }
  return hasFeature;
}

export function hasAnySsoPremiumFeature() {
  return hasAnySsoFeature(MetabaseSettings.get("token-features"));
}

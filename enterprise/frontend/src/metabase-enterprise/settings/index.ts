import { hasAnySsoFeature } from "metabase/common/utils/plan";
import MetabaseSettings from "metabase/lib/settings";
import type { TokenFeature } from "metabase-types/api";

export function hasPremiumFeature(feature: TokenFeature) {
  return MetabaseSettings.get("token-features")?.[feature];
}

export function hasAnySsoPremiumFeature() {
  return hasAnySsoFeature(MetabaseSettings.get("token-features"));
}

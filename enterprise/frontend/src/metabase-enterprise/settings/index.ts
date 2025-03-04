import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { isTest } from "metabase/env";
import MetabaseSettings from "metabase/lib/settings";
import type { TokenFeature } from "metabase-types/api";

export function hasPremiumFeature(feature: TokenFeature) {
  const tokenFeatures = MetabaseSettings.get("token-features");
  if (tokenFeatures == null) {
    // This is the SDK, because settings are only loaded asynchronously after the SDK has run.
    return false;
  }
  const hasFeature = MetabaseSettings.get("token-features")?.[feature];
  if (hasFeature == null) {
    console.warn(
      `Unknown premium feature: '${feature}'.`,
      isTest
        ? "\nDid you forget to use `mockSettings` instead of `createMockSettings` when testing paid features?"
        : "",
    );
  }
  return hasFeature;
}

export function hasAnySsoPremiumFeature() {
  return hasAnySsoFeature(MetabaseSettings.get("token-features"));
}

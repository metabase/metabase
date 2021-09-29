import MetabaseSettings from "metabase/lib/settings";

export function hasPremiumFeature(feature) {
  const hasFeature = MetabaseSettings.get("premium-features", {})[feature];
  if (hasFeature == null) {
    console.warn("Unknown premium feature", feature);
  }
  return hasFeature;
}

import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellCachePreemptive = ({ location }: { location: string }) => {
  const campaign = "cache-preemptive";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasGranularCaching = useHasTokenFeature("cache_granular_controls");
  const hasPreemptiveCaching = useHasTokenFeature("cache_preemptive");

  // Don't double-stack with UpsellCacheConfig — that one is the better
  // gateway message for users who don't even have granular controls yet.
  if (!hasGranularCaching || hasPreemptiveCaching) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Keep caches fresh automatically`}
      onClick={triggerUpsellFlow}
    >
      {t`Preemptive caching refreshes results before they expire, so dashboards always load instantly without waiting on a query.`}
    </UpsellBanner>
  );
};

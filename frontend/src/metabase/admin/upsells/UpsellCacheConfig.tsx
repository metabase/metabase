import { jt, t } from "ttag";

import { UpsellCard } from "metabase/common/components/UpsellCard";
import { useHasTokenFeature } from "metabase/common/hooks/use-has-token-feature";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { Box } from "metabase/ui";

import { UPGRADE_URL } from "./constants";

export const UpsellCacheConfig = ({ location }: { location: string }) => {
  const campaign = "cache-granular-controls";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  const hasCache = useHasTokenFeature("cache_granular_controls");

  if (hasCache) {
    return null;
  }

  return (
    <Box>
      <UpsellCard
        title={t`Control your caching`}
        campaign={campaign}
        buttonText={t`Try Metabase Pro`}
        buttonLink={UPGRADE_URL}
        location={location}
        onClick={triggerUpsellFlow}
      >
        {jt`Get granular caching controls for each database, dashboard, and query with ${(
          <strong key="label">{t`Metabase Pro.`}</strong>
        )}`}
      </UpsellCard>
    </Box>
  );
};

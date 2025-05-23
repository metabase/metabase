import { jt, t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks/use-has-token-feature";
import { Box } from "metabase/ui";

import { UpsellCard } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellCacheConfig = ({ source }: { source: string }) => {
  const hasCache = useHasTokenFeature("cache_granular_controls");

  if (hasCache) {
    return null;
  }

  return (
    <Box>
      <UpsellCard
        title={t`Control your caching`}
        campaign="cache-granular-controls"
        buttonText={t`Try Metabase Pro`}
        buttonLink={UPGRADE_URL}
        source={source}
      >
        {jt`Get granular caching controls for each database, dashboard, and query with ${(
          <strong key="label">{t`Metabase Pro.`}</strong>
        )}`}
      </UpsellCard>
    </Box>
  );
};

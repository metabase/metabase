import { t } from "ttag";

import { UpsellBigCard } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellSerialization = ({ source }: { source: string }) => {
  const hasSerialization = useHasTokenFeature("serialization");
  const campaign = "serialization";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasSerialization) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Move content between environments`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      onClick={triggerUpsellFlow}
    >
      {t`Export questions, dashboards, and collections from one Metabase instance and import them into another. Perfect for promoting content from staging to production.`}
    </UpsellBigCard>
  );
};

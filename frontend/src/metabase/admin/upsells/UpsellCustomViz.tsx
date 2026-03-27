import { t } from "ttag";

import { UpsellBigCard } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellCustomViz = ({ source }: { source: string }) => {
  const hasCustomViz = useHasTokenFeature("custom-viz");
  const campaign = "custom-viz";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasCustomViz) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Build your own visualizations`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      onClick={triggerUpsellFlow}
    >
      {t`Create custom chart types tailored to your data using the Custom Visualization SDK. Add them to any question in your Metabase instance.`}
    </UpsellBigCard>
  );
};

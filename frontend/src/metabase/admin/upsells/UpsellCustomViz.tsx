import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellCustomViz = ({ location }: { location: string }) => {
  const hasCustomViz = useHasTokenFeature("custom-viz");
  const campaign = "custom-viz";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  if (hasCustomViz) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Build your own visualizations`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      onClick={triggerUpsellFlow}
    >
      {t`Create custom chart types tailored to your data using the Custom visualizations SDK.`}
    </UpsellBanner>
  );
};

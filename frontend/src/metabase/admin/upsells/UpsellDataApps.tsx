import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellDataApps = ({ location }: { location: string }) => {
  const hasDataApps = useHasTokenFeature("data-apps");
  const campaign = "data-apps";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  if (hasDataApps) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Build apps on your data`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      onClick={triggerUpsellFlow}
    >
      {t`Ship interactive apps powered by your data, served right inside Metabase.`}
    </UpsellBanner>
  );
};

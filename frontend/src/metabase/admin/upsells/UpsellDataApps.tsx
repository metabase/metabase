import { t } from "ttag";

import { UpsellBigCard } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellDataApps = ({ source }: { source: string }) => {
  const hasDataApps = useHasTokenFeature("data-apps");
  const campaign = "data-apps";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasDataApps) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Build custom data apps`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      illustrationSrc="app/assets/img/upsell-data-apps.png"
      onClick={triggerUpsellFlow}
    >
      <span>
        {t`Build custom user interfaces, forms, and other tools that write back to your database. Automate chores, manage back-office work, and set up workflows to act on your data, all built with AI on top of your semantic layer.`}
      </span>
    </UpsellBigCard>
  );
};

import { t } from "ttag";

import { UpsellCard } from "metabase/common/components/UpsellCard";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UPGRADE_URL } from "./constants";

export function UpsellMetabaseBanner() {
  const campaign = "remove-mb-branding";
  const location = "static-embed-settings-look-and-feel";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  return (
    <UpsellCard
      title={t`Removing the banner`}
      buttonLink={UPGRADE_URL}
      buttonText={t`Upgrade plan`}
      campaign={campaign}
      location={location}
      fullWidth
      onClick={triggerUpsellFlow}
    >
      {t`The “Powered by Metabase” banner appears on all guest embeds created with your current version. Upgrade to remove it (and customize a lot more)`}
    </UpsellCard>
  );
}

import { t } from "ttag";

import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UpsellCard } from "./UpsellCard";
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
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell referencing the Metabase brand, only visible to admins */}
      {t`The “Powered by Metabase” banner appears on all guest embeds created with your current version. Upgrade to remove it (and customize a lot more)`}
    </UpsellCard>
  );
}

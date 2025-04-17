import { t } from "ttag";

import { UpsellCard } from "metabase/admin/upsells/components";

import { UPGRADE_URL } from "./constants";

export function UpsellMetabaseBanner() {
  return (
    <UpsellCard
      title={t`Removing the banner`}
      buttonLink={UPGRADE_URL}
      buttonText={t`Upgrade plan`}
      campaign="remove-mb-branding"
      source="static-embed-settings-look-and-feel"
      fullWidth
    >
      {t`The “Powered by Metabase” banner appears on all static embeds created with your current version. Upgrade to remove it (and customize a lot more)`}
    </UpsellCard>
  );
}

import { t } from "ttag";

import { UpsellCard } from "metabase/admin/upsells/components";

export function UpsellMetabaseBanner() {
  return (
    <UpsellCard
      title={t`Removing the banner`}
      buttonLink="https://www.metabase.com/upgrade"
      buttonText={t`Upgrade to a paid plan`}
      campaign="remove-mb-branding"
      source="static-embed-settings-look-and-feel"
      fullWidth
    >
      {t`The “Powered by Metabase” banner appears on all static embeds created with the open source version. You’ll need to upgrade to remove it.`}
    </UpsellCard>
  );
}

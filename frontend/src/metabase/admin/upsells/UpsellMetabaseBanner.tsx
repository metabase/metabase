import { t } from "ttag";

import { UpsellCard } from "metabase/admin/upsells/components";

export function UpsellMetabaseBanner() {
  return (
    <UpsellCard
      title={t`Removing the banner`}
      buttonLink="https://www.metabase.com/upgrade"
      buttonText={t`Upgrade plan`}
      campaign="remove-mb-branding"
      source="static-embed-settings-look-and-feel"
      fullWidth
    >
      {t`The “Powered by Metabase” banner appears on all static embeds created with your current version. Upgrade to remove it (and customize a lot more)`}
    </UpsellCard>
  );
}

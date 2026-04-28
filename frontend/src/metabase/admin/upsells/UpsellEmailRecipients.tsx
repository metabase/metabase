import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellEmailRecipients = ({ location }: { location: string }) => {
  const campaign = "email-recipients";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasAllowList = useHasTokenFeature("email_allow_list");
  const hasRestrictRecipients = useHasTokenFeature("email_restrict_recipients");

  if (hasAllowList && hasRestrictRecipients) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Control who can receive emails`}
      onClick={triggerUpsellFlow}
    >
      {t`Restrict dashboard subscriptions and alerts to approved domains, and limit which users show up in recipient suggestions.`}
    </UpsellBanner>
  );
};

import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellSessionTimeout = ({ location }: { location: string }) => {
  const campaign = "session-timeout";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasSessionTimeout = useHasTokenFeature("session_timeout_config");
  const hasDisablePasswordLogin = useHasTokenFeature("disable_password_login");

  if (hasSessionTimeout && hasDisablePasswordLogin) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Tighten session security`}
      onClick={triggerUpsellFlow}
    >
      {t`Set custom session timeouts and require SSO-only access by disabling password login on Metabase Pro and Enterprise.`}
    </UpsellBanner>
  );
};

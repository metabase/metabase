import { t } from "ttag";

import { UpsellBigCard } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellSecurityCenter = ({ source }: { source: string }) => {
  const hasSecurityCenter = useHasTokenFeature("admin_security_center");
  const campaign = "security-center";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasSecurityCenter) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`See your security posture at a glance`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      onClick={triggerUpsellFlow}
    >
      {t`The Security Center surfaces misconfigurations, risky permissions, and exposed content so admins can lock down a Metabase instance with confidence.`}
    </UpsellBigCard>
  );
};

import { jt, t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { getPlan, isProPlan, useSetting } from "metabase/settings";

export const UpsellHostingBanner = ({ location }: { location: string }) => {
  const isHosted = useSetting("is-hosted?");
  const features = useSetting("token-features");

  const plan = getPlan(features);
  const isPro = isProPlan(plan);

  if (isHosted || isPro) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Minimize maintenance`}
      campaign="hosting"
      buttonText={t`Learn more`}
      internalLink="/admin/settings/cloud"
      location={location}
    >
      {jt`${(
        <strong key="migrate">{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellBanner>
  );
};

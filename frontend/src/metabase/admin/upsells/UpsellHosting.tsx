import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellBanner } from "./components";

export const UpsellHostingBanner = ({ location }: { location: string }) => {
  const isHosted = useSelector(getIsHosted);
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

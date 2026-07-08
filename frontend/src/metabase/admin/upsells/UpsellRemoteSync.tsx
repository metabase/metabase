import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellBigCard } from "metabase/common/components/upsells/components";
import S from "metabase/common/components/upsells/components/Upsells.module.css";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

export const UpsellRemoteSync = ({ source }: { source: string }) => {
  const hasRemoteSync = useHasTokenFeature("remote_sync");
  const tokenFeatures = useSetting("token-features");
  const applicationName = useSelector(getApplicationName);
  const isPro = isProPlan(getPlan(tokenFeatures));
  const campaign = "remote-sync";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasRemoteSync || isPro) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Manage your ${applicationName} content in Git`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      onClick={triggerUpsellFlow}
      illustrationSrc="app/assets/img/upsell-remote-sync.png"
    >
      {t`Keep your most important datasets, metrics, and SQL logic under version control. Sync content to a Git repository to review changes, collaborate, and maintain a production-ready source of truth.`}
      <ExternalLink
        className={S.SecondaryCTALink}
        href="https://www.metabase.com/product/git-sync"
      >
        {t`Learn more`}
      </ExternalLink>
    </UpsellBigCard>
  );
};

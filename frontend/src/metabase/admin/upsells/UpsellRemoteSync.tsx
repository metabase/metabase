import { t } from "ttag";

import upsellRemoteSyncImage from "assets/img/upsell-remote-sync.png?url";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellBigCard } from "metabase/common/components/upsells/components";
import S from "metabase/common/components/upsells/components/Upsells.module.css";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { PLUGIN_ADMIN_SETTINGS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

export const UpsellRemoteSync = ({ source }: { source: string }) => {
  const applicationName = useSelector(getApplicationName);
  const campaign = "remote-sync";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (PLUGIN_REMOTE_SYNC.isEnabled) {
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
      illustrationSrc={upsellRemoteSyncImage}
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

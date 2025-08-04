import cx from "classnames";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import linkStyles from "metabase/css/core/link.module.css";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { UnstyledButton } from "metabase/ui";

export function UpsellSdkLink({ className }: { className?: string }) {
  const campaign = "embedding-sdk";
  const location = "embedding-sdk-admin";
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: campaign,
      utm_content: location,
    }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  if (triggerUpsellFlow) {
    return (
      <UnstyledButton
        onClick={triggerUpsellFlow}
        c="brand"
        className={cx(linkStyles.link, className)}
        key="upgrade-button"
        fz="inherit"
      >
        {t`upgrade to Metabase Pro`}
      </UnstyledButton>
    );
  }

  return (
    <ExternalLink
      key="upgrade-url"
      href={upgradeUrl}
      className={cx(linkStyles.link, className)}
    >
      {t`upgrade to Metabase Pro`}
    </ExternalLink>
  );
}

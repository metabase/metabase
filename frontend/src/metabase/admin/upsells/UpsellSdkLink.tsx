import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { UnstyledButton } from "metabase/ui";

import S from "./UpsellSdkLink.module.css";

export function UpsellSdkLink() {
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
        fz="sm"
        c="brand"
        className={S.link}
        key="upgrade-button"
      >
        {t`upgrade to Metabase Pro`}
      </UnstyledButton>
    );
  }
  return (
    <ExternalLink key="upgrade-url" href={upgradeUrl}>
      {t`upgrade to Metabase Pro`}
    </ExternalLink>
  );
}

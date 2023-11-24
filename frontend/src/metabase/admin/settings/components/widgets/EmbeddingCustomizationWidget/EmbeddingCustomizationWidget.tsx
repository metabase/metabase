import { jt, t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingHeader from "../../SettingHeader";

export const EmbeddingCustomizationWidget = () => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "embed_standalone" }),
  );

  const setting = {
    // XXX: Don't replace the application name. This is admin settings
    description: jt`In order to remove the Metabase logo from embeds, you can always upgrade to ${(
      <ExternalLink key="upgrade-link" href={upgradeUrl}>
        {t`one of our paid plans.`}
      </ExternalLink>
    )}`,
  };

  return <SettingHeader id="embedding-customization-info" setting={setting} />;
};

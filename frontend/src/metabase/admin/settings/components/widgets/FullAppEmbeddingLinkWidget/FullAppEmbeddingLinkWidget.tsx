import { jt, t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingHeader from "../../SettingHeader";

export const FullAppEmbeddingLinkWidget = () => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "embed_fullapp" }),
  );

  const setting = {
    display_name: t`embedding the entire metabase app`,
    description: jt`With ${(
      <ExternalLink key="upgrade-link" href={upgradeUrl}>
        {t`some of our paid plans,`}
      </ExternalLink>
    )} you can embed the full Metabase app and enable your users to drill-through to charts, browse collections, and use the graphical query builder. You can also get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.`,
  };

  return <SettingHeader id="embedding-customization-info" setting={setting} />;
};

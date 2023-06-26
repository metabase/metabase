import { connect } from "react-redux";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { State } from "metabase-types/store";
import SettingHeader from "../../SettingHeader";

interface StateProps {
  upgradeUrl: string;
}

type EmbeddingCustomizationInfoProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  upgradeUrl: getUpgradeUrl(state, { utm_media: "embed_standalone" }),
});

const EmbeddingCustomizationInfo = ({
  upgradeUrl,
}: EmbeddingCustomizationInfoProps) => {
  const setting = {
    description: jt`In order to remove the Metabase logo from embeds, you can always upgrade to ${(
      <ExternalLink key="upgrade-link" href={upgradeUrl}>
        {t`one of our paid plans.`}
      </ExternalLink>
    )}`,
  };

  return <SettingHeader id="embedding-customization-info" setting={setting} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(EmbeddingCustomizationInfo);

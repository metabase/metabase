import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import ExternalLink from "metabase/core/components/ExternalLink";
import Tooltip from "metabase/core/components/Tooltip";
import Button from "metabase/core/components/Button";
import { Header, Paragraph } from "./EmbeddingLegalese.styled";

interface EmbeddingLegaleseProps {
  setting: {
    placeholder: string;
    is_env_setting: boolean;
  };
  onChange: (isEmbeddingEnabled: boolean) => void;
}

const EmbeddingLegalese = ({ setting, onChange }: EmbeddingLegaleseProps) => {
  const embeddingDocsUrl = useSelector(state =>
    getDocsUrl(state, {
      page: "embedding/start",
    }),
  );

  return (
    <div className="text-measure">
      <Header>{t`Embedding`}</Header>
      <Paragraph>
        {t`Allow questions, dashboards and more to be embedded.`}
        <ExternalLink href={embeddingDocsUrl}>{t`Learn more.`}</ExternalLink>
      </Paragraph>

      <Tooltip
        tooltip={setting.placeholder}
        isEnabled={setting.is_env_setting}
        maxWidth={300}
      >
        <Button
          primary
          disabled={setting.is_env_setting}
          onClick={() => {
            MetabaseAnalytics.trackStructEvent(
              "Admin Embed Settings",
              "Embedding Enable Click",
            );
            onChange(true);
          }}
        >{t`Enable`}</Button>
      </Tooltip>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmbeddingLegalese;

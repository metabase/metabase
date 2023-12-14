import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { Switch, Title } from "metabase/ui";
import { Paragraph } from "./EmbeddingLegalese.styled";

interface EmbeddingLegaleseProps {
  setting: {
    placeholder: string;
    is_env_setting: boolean;
  };
  onChange: (isEmbeddingEnabled: boolean) => void;
}

const EmbeddingLegalese = ({ onChange }: EmbeddingLegaleseProps) => (
  <div className="text-measure">
    <Paragraph>
      {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
    </Paragraph>
    <Switch
      labelPosition="left"
      label={<Title order={4}>{t`Embedding Enabled`}</Title>}
      onChange={e => {
        onChange(e.currentTarget.checked);
        MetabaseAnalytics.trackStructEvent(
          "Admin Embed Settings",
          "Embedding Enable Click",
        );
      }}
    />
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmbeddingLegalese;

import React from "react";
import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import ExternalLink from "metabase/core/components/ExternalLink";
import Tooltip from "metabase/core/components/Tooltip";
import Button from "metabase/core/components/Button";
import {
  Header,
  Paragraph,
  StyledCollapseSection,
} from "./EmbeddingLegalese.styled";

interface EmbeddingLegaleseProps {
  setting: {
    placeholder: string;
    is_env_setting: boolean;
  };
  onChange: (isEmbeddingEnabled: boolean) => void;
}

const EmbeddingLegalese = ({ setting, onChange }: EmbeddingLegaleseProps) => (
  <div className="text-measure">
    <Header>{t`Embedding`}</Header>
    <Paragraph>
      {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
    </Paragraph>

    <Paragraph>
      {t`By enabling embedding you're agreeing to`}{" "}
      <ExternalLink
        href="https://metabase.com/license/embedding"
        target="_blank"
      >
        {t`our embedding license.`}
      </ExternalLink>
    </Paragraph>

    <StyledCollapseSection
      header={t`More details`}
      iconVariant="up-down"
      iconPosition="right"
    >
      <Paragraph>
        {t`When you embed charts or dashboards from Metabase in your own
        application, that application isn't subject to the Affero General Public
        License that covers the rest of Metabase, provided you keep the Metabase
        logo and the "Powered by Metabase" visible on those embeds.`}
      </Paragraph>
      <Paragraph>
        {t`Your should, however, read the license text linked above as that is the
        actual license that you will be agreeing to by enabling this feature.`}
      </Paragraph>
    </StyledCollapseSection>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmbeddingLegalese;

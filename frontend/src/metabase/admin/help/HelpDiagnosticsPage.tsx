import cx from "classnames";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Code } from "metabase/ui";

import S from "./help.module.css";
import { useDiagnosticInfo } from "./use-diagnostic-info";
import { getConnectionPoolDetailsUrl } from "./utils";

export const HelpDiagnosticsPage = () => {
  const { diagnosticInfo } = useDiagnosticInfo();

  return (
    <SettingsPageWrapper title={t`Diagnostic info`}>
      <SettingsSection
        title={t`Instance details`}
        description={t`Please include these details in support requests. Thank you!`}
      >
        <InfoBlock>{diagnosticInfo}</InfoBlock>
      </SettingsSection>
      <SettingsSection
        title={t`Advanced details`}
        description={t`Click to download`}
      >
        <ExternalLink
          href={getConnectionPoolDetailsUrl()}
          target="_blank"
          className={S.HelpExternalLink}
        >
          <h3 className={CS.textBrand}>{t`Connection Pool Details`}</h3>
          <p className={cx(CS.m0, CS.mt1)}>
            {t`Information about active and idle connections for all pools`}
          </p>
        </ExternalLink>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};

const InfoBlock = ({ children }: { children: string }) => (
  <Box p="lg" className={cx(CS.bordered, CS.rounded, CS.bgLight, CS.relative)}>
    <Box className={S.InfoBlockButton}>
      <CopyButton value={children} />
    </Box>
    <Code bg="transparent" block>
      {children}
    </Code>
  </Box>
);

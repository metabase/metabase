import cx from "classnames";
import { type PropsWithChildren, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellBetterSupport } from "metabase/admin/upsells";
import { Code } from "metabase/common/components/Code";
import { CopyButton } from "metabase/common/components/CopyButton";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_SUPPORT } from "metabase/plugins";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { UtilApi } from "metabase/services";
import { Box, Group } from "metabase/ui";

import S from "./help.module.css";

function navigatorInfo() {
  return _.pick(navigator, "language", "platform", "userAgent", "vendor");
}

const template = `**Describe the bug**
A clear and concise description of what the bug is.

**Logs**
Please include javascript console and server logs around the time this bug occurred. For information about how to get these, consult our [bug troubleshooting guide](https://metabase.com/docs/latest/troubleshooting-guide/bugs.html)

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Severity**
How severe an issue is this bug to you? Is this annoying, blocking some users, blocking an upgrade or blocking your usage of Metabase entirely?
Note: the more honest and specific you are here the more we will take you seriously.

**Additional context**
Add any other context about the problem here.

**Metabase Diagnostic Info**
`;

function githubIssueLink(bugReportDetails: string) {
  return (
    "https://github.com/metabase/metabase/issues/new?title=&labels=.Needs+Triage%2C+Type%3ABug&body=" +
    encodeURIComponent(template + "\n```json\n" + bugReportDetails + "\n```")
  );
}

interface HelpLinkProps {
  title: string;
  description: string;
  link: string;
}

const HelpLink = ({ title, description, link }: HelpLinkProps) => (
  <ExternalLink href={link} target="_blank" className={S.HelpExternalLink}>
    <div>
      <h3 className={CS.textBrand}>{title}</h3>
      <p className={cx(CS.m0, CS.mt1)}>{description}</p>
    </div>
  </ExternalLink>
);

interface InfoBlockProps {
  children: string;
}

const InfoBlock = ({ children }: InfoBlockProps) => (
  <Box p="md" className={cx(CS.bordered, CS.rounded, CS.bgLight, CS.relative)}>
    <Box className={S.InfoBlockButton}>
      <CopyButton value={children} />
    </Box>
    <Code>{children}</Code>
  </Box>
);

export const Help = ({ children }: PropsWithChildren) => {
  const [details, setDetails] = useState({ "browser-info": navigatorInfo() });
  const { tag } = useSetting("version");
  const isPaidPlan = useSelector(getIsPaidPlan);

  useMount(async () => {
    const newDetails = (await UtilApi.bug_report_details()) as Record<
      string,
      unknown
    >;
    setDetails((oldDetails) => ({ ...oldDetails, ...newDetails }));
  });

  const detailString = JSON.stringify(details, null, 2);
  const compactDetailStringForUrl = encodeURIComponent(JSON.stringify(details));

  return (
    <SettingsPageWrapper title={t`Help`}>
      <Group grow>
        <HelpLink
          title={t`Get help`}
          description={t`Resources and support`}
          link={
            isPaidPlan
              ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${tag}&diag=${compactDetailStringForUrl}`
              : `https://www.metabase.com/help?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${tag}`
          }
        />
        <HelpLink
          title={t`Report an issue`}
          description={t`Create a GitHub issue (includes the diagnostic info below)`}
          link={githubIssueLink(detailString)}
        />
      </Group>

      <UpsellBetterSupport location="settings-troubleshooting" />

      {PLUGIN_SUPPORT.isEnabled && <PLUGIN_SUPPORT.SupportSettings />}

      <SettingsSection
        title={t`Diagnostic info`}
        description={t`Please include these details in support requests. Thank you!`}
      >
        <InfoBlock>{detailString}</InfoBlock>
      </SettingsSection>
      <SettingsSection
        title={t`Advanced details`}
        description={t`Click to download`}
      >
        <HelpLink
          title={t`Connection Pool Details`}
          description={t`Information about active and idle connections for all pools`}
          link={UtilApi.get_connection_pool_details_url()}
        />
      </SettingsSection>
      {/* render 'children' so that the child modal routes can show up */}
      {children}
    </SettingsPageWrapper>
  );
};

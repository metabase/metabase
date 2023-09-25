import { ReactNode, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import AdminHeader from "metabase/components/AdminHeader";
import Code from "metabase/components/Code";
import CopyButton from "metabase/components/CopyButton";
import ExternalLink from "metabase/core/components/ExternalLink";

import { UtilApi } from "metabase/services";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan, getSetting } from "metabase/selectors/settings";
import {
  HelpBody,
  HelpLinks,
  HelpRoot,
  InfoBlockButton,
  InfoBlockRoot,
} from "./Help.styled";

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
  <li className="mb2">
    <ExternalLink
      className="bordered border-brand-hover rounded transition-border flex p2 no-decoration"
      href={link}
      target="_blank"
    >
      <div>
        <h3 className="text-brand">{title}</h3>
        <p className="m0 mt1">{description}</p>
      </div>
    </ExternalLink>
  </li>
);

interface InfoBlockProps {
  children?: ReactNode;
}

const InfoBlock = ({ children }: InfoBlockProps) => (
  <InfoBlockRoot className="bordered rounded bg-light relative">
    <InfoBlockButton className="absolute top right text-brand-hover cursor-pointer">
      <CopyButton value={children} />
    </InfoBlockButton>
    <Code>{children}</Code>
  </InfoBlockRoot>
);

export const Help = () => {
  const [details, setDetails] = useState({ "browser-info": navigatorInfo() });
  const { tag } = useSelector(state => getSetting(state, "version"));
  const isPainPlan = useSelector(getIsPaidPlan);

  useMount(async () => {
    const newDetails = await UtilApi.bug_report_details();
    setDetails(oldDetails => ({ ...oldDetails, ...newDetails }));
  });

  const detailString = JSON.stringify(details, null, 2);
  const compactDetailStringForUrl = encodeURIComponent(JSON.stringify(details));

  return (
    <HelpRoot>
      <AdminHeader title={t`Help`} className="mb2" />
      <HelpLinks>
        <ol>
          <HelpLink
            title={t`Get Help`}
            description={t`Resources and support`}
            link={
              isPainPlan
                ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${tag}&diag=${compactDetailStringForUrl}`
                : `https://www.metabase.com/help?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${tag}`
            }
          />
          <HelpLink
            title={t`File a bug report`}
            description={t`Create a GitHub issue (includes the diagnostic info below)`}
            link={githubIssueLink(detailString)}
          />
        </ol>
      </HelpLinks>

      <HelpBody>
        <AdminHeader title={t`Diagnostic Info`} className="mb2" />
        <p>{t`Please include these details in support requests. Thank you!`}</p>
        <InfoBlock>{detailString}</InfoBlock>
        <div className="text-medium text-bold text-uppercase py2">{t`Advanced Details (click to download)`}</div>
        <ol>
          <HelpLink
            title={t`Connection Pool Details`}
            description={t`Information about active and idle connections for all pools`}
            link={UtilApi.get_connection_pool_details_url()}
          />
        </ol>
      </HelpBody>
    </HelpRoot>
  );
};

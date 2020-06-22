import React, { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import Code from "metabase/components/Code";
import CopyButton from "metabase/components/CopyButton";
import ExternalLink from "metabase/components/ExternalLink";

import { UtilApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";

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

function githubIssueLink(bugReportDetails) {
  return (
    "https://github.com/metabase/metabase/issues/new?title=&labels=.Needs+Triage%2C+Type%3ABug&body=" +
    encodeURIComponent(template + "\n```json\n" + bugReportDetails + "\n```")
  );
}

function discourseLink(bugReportDetails) {
  return (
    "https://discourse.metabase.com/new-topic?category_id=7&body=" +
    encodeURIComponent("```json\n" + bugReportDetails + "\n```")
  );
}

const HelpLink = ({ title, description, link }) => (
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

const InfoBlock = ({ children }) => (
  <Box p={2} className="bordered rounded bg-light relative">
    <Box m={2} className="absolute top right text-brand-hover cursor-pointer">
      <CopyButton value={children} />
    </Box>
    <Code>{children}</Code>
  </Box>
);

export default class Help extends Component {
  state = {
    details: { "browser-info": navigatorInfo() },
  };

  async fetchDetails() {
    const details = await UtilApi.bug_report_details();
    this.setState({ details: { ...this.state.details, ...details } });
  }

  componentWillMount() {
    this.fetchDetails();
  }

  render() {
    const { details } = this.state;
    const detailString = JSON.stringify(details, null, 2);
    return (
      <Box p={3}>
        <AdminHeader title={t`Help`} className="mb2" />
        <Box my={2} style={{ maxWidth: "468px" }}>
          <ol>
            <HelpLink
              title={t`Metabase Documentation`}
              description={t`Includes a troubleshooting guide`}
              link={MetabaseSettings.docsUrl()}
            />
            <HelpLink
              title={t`Post on the Metabase support forum`}
              description={t`A community forum for all things Metabase`}
              link={discourseLink(detailString)}
            />
            <HelpLink
              title={t`File a bug report`}
              description={t`Create a GitHub issue (includes the diagnostic info below)`}
              link={githubIssueLink(detailString)}
            />
          </ol>
        </Box>

        <Box my={2}>
          <AdminHeader title={t`Diagnostic Info`} className="mb2" />
          <p>{t`Please include these details in support requests. Thank you!`}</p>
          <InfoBlock>{detailString}</InfoBlock>
        </Box>
      </Box>
    );
  }
}

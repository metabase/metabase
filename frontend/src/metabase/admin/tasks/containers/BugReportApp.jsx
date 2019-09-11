import React, { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import CopyButton from "metabase/components/CopyButton";

import { UtilApi } from "metabase/services";

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
    "https://github.com/metabase/metabase/issues/new?title=&labels=Type:Bug&body=" +
    encodeURI(template) +
    // replace semicolons because everything after is ignored
    encodeURI(bugReportDetails.replace(";", " "))
  );
}

const InfoBlock = ({ children }) => (
  <Box p={2} className="bordered rounded bg-light relative">
    <Box m={2} className="absolute top right text-brand-hover cursor-pointer">
      <CopyButton value={children} />
    </Box>
    <pre
      style={{
        fontFamily: "Lucida Console, Monaco, monospace",
        fontSize: 14,
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </pre>
  </Box>
);

export default class BugReportApp extends Component {
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
    return (
      <Box p={3}>
        <AdminHeader title={t`Bug Report`} />
        <p>
          Running into issues?{" "}
          <a
            className="link"
            href={githubIssueLink(JSON.stringify(details, null, 2))}
          >
            File a bug report on GitHub
          </a>
          . Please include the following:
        </p>
        <Box my={2}>
          <h3 className="mb1">Diagnostic Info</h3>
          <InfoBlock>{JSON.stringify(details, null, 2)}</InfoBlock>
        </Box>
      </Box>
    );
  }
}

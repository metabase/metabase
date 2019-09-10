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

const InfoBlock = ({ children }) => (
  <Box p={2} className="bordered rounded bg-light relative">
    <Box m={2} className="absolute top right text-brand-hover cursor-pointer">
      <CopyButton value={children} />
    </Box>
    <pre
      style={{ fontFamily: "Lucida Console, Monaco, monospace", fontSize: 14 }}
    >
      {children}
    </pre>
  </Box>
);

export default class BugReportApp extends Component {
  state = {
    details: {"browser-info": navigatorInfo()},
  };

  copyToClipboard = e => {
    this.textArea.select();
    document.execCommand("copy");
    this.setState({ copySuccess: "Copied!" });
  };

  async fetchDetails() {
    const details = await UtilApi.bug_report_details();
    this.setState({ details: { ...this.state.details, ...details  } });
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
          Running into issues? <a className="link" href="https://github.com/metabase/metabase/issues/new?assignees=&labels=Type%3ABug&template=bug_report.md&title=">File a bug report on GitHub</a>. Please include the following:
        </p>
        <Box my={2}>
          <h3 className="mb1">Diagnostic Info</h3>
          <InfoBlock>{JSON.stringify(details, null, 2)}</InfoBlock>
        </Box>
      </Box>
    );
  }
}

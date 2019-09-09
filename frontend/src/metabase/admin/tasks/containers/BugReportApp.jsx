import React, { Component } from "react";
import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import { t } from "ttag";
import { UtilApi } from "metabase/services";

import CopyButton from "metabase/components/CopyButton";

function navigatorInfo() {
  return {
    appVersion: navigator.appVersion,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
  };
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
  constructor() {
    super();
    this.state = {
      details: {},
    };
  }

  copyToClipboard = e => {
    this.textArea.select();
    document.execCommand("copy");
    this.setState({ copySuccess: "Copied!" });
  };

  async fetchDetails() {
    const details = await UtilApi.bug_report_details();
    this.setState({ details: details });
  }

  componentWillMount() {
    this.fetchDetails();
  }

  render() {
    const { details } = this.state;
    return (
      <Box p={3}>
        <AdminHeader title={t`Bug Report Details`} />
        <Box my={2}>
          <h3 className="mb1">System Info</h3>
          <InfoBlock>{JSON.stringify(details, null, 2)}</InfoBlock>
        </Box>

        <h3 className="mb1">Browser Info</h3>
        <InfoBlock>{JSON.stringify(navigatorInfo(), null, 2)}</InfoBlock>
      </Box>
    );
  }
}

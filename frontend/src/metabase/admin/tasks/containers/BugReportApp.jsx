import React, { Component } from "react";
import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import { t } from "ttag";
import { UtilApi } from "metabase/services";

export default class BugReportApp extends Component {
  constructor() {
    super();
    this.state = {
      details: {},
    };
  }
  
  async fetchDetails() {
    const details = await UtilApi.bug_report_details();
    this.setState({ details: details });
  }

  componentWillMount() {
    this.fetchDetails();
  }
  
  render() {
    const { details } = this.state;
    console.log("STATE", this.state);
    return (
      <Box p={3}>
        { String(details) }
        <AdminHeader title={t`Report a Bug`} />
      </Box>
    );
  }
}

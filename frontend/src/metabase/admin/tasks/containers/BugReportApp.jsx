import React, { Component } from "react";
import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import { t } from "ttag";

import BugReport from "metabase/entities/bug-reports";

@BugReport.loadList({})

export default class BugReportApp extends Component {
  render() {
    return (
      <Box p={3}>
        <AdminHeader title={t`Report a Bug`} />
      </Box>
    );
  }
}

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Box } from "grid-styled";
import EmptyState from "metabase/components/EmptyState";

const propTypes = {
  isNightMode: PropTypes.bool.isRequired,
};

const DashboardEmptyState = ({ isNightMode }) => (
  <Box mt={[2, 4]} color={isNightMode ? "white" : "inherit"}>
    <EmptyState
      illustrationElement={<span className="QuestionCircle">?</span>}
      title={t`This dashboard is looking empty.`}
      message={t`Add a question to start making it useful!`}
    />
  </Box>
);

DashboardEmptyState.propTypes = propTypes;

export default DashboardEmptyState;

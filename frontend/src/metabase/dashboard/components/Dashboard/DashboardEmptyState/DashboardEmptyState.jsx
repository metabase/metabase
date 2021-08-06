import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Container } from "./DashboardEmptyState.styled";
import EmptyState from "metabase/components/EmptyState";

const propTypes = {
  isNightMode: PropTypes.bool.isRequired,
};

const questionCircle = <span className="QuestionCircle">?</span>;

const DashboardEmptyState = ({ isNightMode }) => (
  <Container isNightMode={isNightMode}>
    <EmptyState
      illustrationElement={questionCircle}
      title={t`This dashboard is looking empty.`}
      message={t`Add a question to start making it useful!`}
    />
  </Container>
);

DashboardEmptyState.propTypes = propTypes;

export default DashboardEmptyState;

import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { Container } from "./DashboardEmptyState.styled";

const propTypes = {
  isDataApp: PropTypes.bool,
  isNightMode: PropTypes.bool.isRequired,
};

const questionCircle = <span className="QuestionCircle">?</span>;

const DashboardEmptyState = ({ isDataApp, isNightMode }) => (
  <Container isNightMode={isNightMode}>
    <EmptyState
      illustrationElement={questionCircle}
      title={
        isDataApp
          ? t`This page is looking empty.`
          : t`This dashboard is looking empty.`
      }
      message={t`Add a question to start making it useful!`}
    />
  </Container>
);

DashboardEmptyState.propTypes = propTypes;

export default DashboardEmptyState;

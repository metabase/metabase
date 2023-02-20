import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import EmptyState from "metabase/components/EmptyState";
import { Container } from "./DashboardEmptyState.styled";

const propTypes = {
  isNightMode: PropTypes.bool.isRequired,
  addQuestion: PropTypes.func.isRequired,
};

const questionCircle = <span className="QuestionCircle">?</span>;

const DashboardEmptyState = ({ isNightMode, addQuestion }) => (
  <Container isNightMode={isNightMode}>
    <EmptyState
      illustrationElement={questionCircle}
      title={t`This dashboard is looking empty.`}
      message={
        <>
          <Button onlyText onClick={addQuestion}>
            {t`Add a saved question`}
          </Button>
          {t`, or `}
          <Link to="/question/new" className="text-bold text-brand">
            {t`ask a new one`}
          </Link>
        </>
      }
    />
  </Container>
);

DashboardEmptyState.propTypes = propTypes;

export default DashboardEmptyState;

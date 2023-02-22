import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EmptyState from "metabase/components/EmptyState";
import { Container, BrandLink } from "./DashboardEmptyState.styled";

const propTypes = {
  isNightMode: PropTypes.bool.isRequired,
  addQuestion: PropTypes.func.isRequired,
  closeNavbar: PropTypes.func.isRequired,
};

const questionCircle = <span className="QuestionCircle">?</span>;

const DashboardEmptyState = ({ isNightMode, addQuestion, closeNavbar }) => (
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
          <BrandLink
            to="/question/new"
            className="text-bold text-brand"
            onClick={closeNavbar}
          >
            {t`ask a new one`}
          </BrandLink>
        </>
      }
    />
  </Container>
);

DashboardEmptyState.propTypes = propTypes;

export default DashboardEmptyState;

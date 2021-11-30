import React from "react";
import PropTypes from "prop-types";
import { LandingPageRoot } from "./LandingPage.styled";

const propTypes = {
  GreetingSection: PropTypes.element.isRequired,
  OurDataSection: PropTypes.element.isRequired,
  showOurData: PropTypes.bool,
};

const LandingPage = ({ GreetingSection, OurDataSection, showOurData }) => {
  return (
    <LandingPageRoot>
      <GreetingSection />
      {showOurData && <OurDataSection />}
    </LandingPageRoot>
  );
};

LandingPage.propTypes = propTypes;

export default LandingPage;

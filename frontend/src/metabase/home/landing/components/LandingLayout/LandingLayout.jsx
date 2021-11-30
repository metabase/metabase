import React from "react";
import PropTypes from "prop-types";
import { LandingLayoutRoot } from "./LandingLayout.styled";

const propTypes = {
  GreetingSection: PropTypes.element,
  OurDataSection: PropTypes.element,
  showOurData: PropTypes.bool,
};

const LandingLayout = ({ GreetingSection, OurDataSection, showOurData }) => {
  return (
    <LandingLayoutRoot>
      <GreetingSection />
      {showOurData && <OurDataSection />}
    </LandingLayoutRoot>
  );
};

LandingLayout.propTypes = propTypes;

export default LandingLayout;

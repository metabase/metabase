import React from "react";
import PropTypes from "prop-types";
import { LandingRoot } from "./LandingApp.styled";

const propTypes = {
  GreetingSection: PropTypes.elementType,
  XraySection: PropTypes.elementType.isRequired,
  OurDataSection: PropTypes.elementType.isRequired,
  showXrays: PropTypes.bool,
  showOurData: PropTypes.bool,
};

const LandingApp = ({
  GreetingSection,
  XraySection,
  OurDataSection,
  showXrays,
  showOurData,
}) => {
  return (
    <LandingRoot>
      <GreetingSection />
      {showXrays && <XraySection />}
      {showOurData && <OurDataSection />}
    </LandingRoot>
  );
};

LandingApp.propTypes = propTypes;

export default LandingApp;

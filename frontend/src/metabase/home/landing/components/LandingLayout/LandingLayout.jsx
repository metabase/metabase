import React from "react";
import PropTypes from "prop-types";

const propTypes = {
  GreetingSection: PropTypes.element,
  OurDataSection: PropTypes.element,
  showOurData: PropTypes.bool,
};

const LandingLayout = ({ GreetingSection, OurDataSection, showOurData }) => {
  return (
    <div>
      <GreetingSection />
      {showOurData && <OurDataSection />}
    </div>
  );
};

LandingLayout.propTypes = propTypes;

export default LandingLayout;

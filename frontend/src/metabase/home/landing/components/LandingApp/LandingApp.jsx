import React from "react";
import PropTypes from "prop-types";
import GreetingSection from "../GreetingSection";
import OurDataSection from "../OurDataSection";
import StartHereSection from "../StartHereSection";
import XraySection from "../XraySection";
import { LandingRoot } from "./LandingApp.styled";

const propTypes = {
  user: PropTypes.object,
  databases: PropTypes.array,
  dashboards: PropTypes.array,
  candidates: PropTypes.array,
  showXrays: PropTypes.bool,
  showOurData: PropTypes.bool,
};

const LandingApp = ({
  user,
  databases,
  dashboards,
  candidates,
  showXrays,
  showOurData,
}) => {
  return (
    <LandingRoot>
      <GreetingSection user={user} />
      <StartHereSection user={user} dashboards={dashboards} />
      {showXrays && <XraySection user={user} candidates={candidates} />}
      {showOurData && <OurDataSection user={user} databases={databases} />}
    </LandingRoot>
  );
};

LandingApp.propTypes = propTypes;

export default LandingApp;

import React, { Fragment } from "react";
import PropTypes from "prop-types";
import GreetingSection from "../GreetingSection";
import OurDataSection from "../OurDataSection";
import StartHereSection from "../StartHereSection";
import XraySection from "../XraySection";
import { LandingRoot } from "./LandingApp.styled";
import {
  hasContentSections,
  hasGreetingSection,
  hasOurDataSection,
  hasStartHereSection,
  hasXraySection,
} from "../../utils/landing";

const propTypes = {
  user: PropTypes.object,
  databases: PropTypes.array,
  dashboards: PropTypes.array,
  candidates: PropTypes.array,
  showXrays: PropTypes.bool,
  showOurData: PropTypes.bool,
};

const LandingApp = props => {
  return (
    <LandingRoot>
      {hasGreetingSection(props) && <GreetingSection {...props} />}
      {hasContentSections(props) && (
        <Fragment>
          {hasStartHereSection(props) && <StartHereSection {...props} />}
          {hasXraySection(props) && <XraySection {...props} />}
          {hasOurDataSection(props) && <OurDataSection {...props} />}
        </Fragment>
      )}
    </LandingRoot>
  );
};

LandingApp.propTypes = propTypes;

export default LandingApp;

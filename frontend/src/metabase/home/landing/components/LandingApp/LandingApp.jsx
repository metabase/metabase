import React, { Fragment } from "react";
import PropTypes from "prop-types";
import GreetingSection from "../GreetingSection";
import OurAnalyticsSection from "../OurAnalyticsSection";
import OurDataSection from "../OurDataSection";
import StartHereSection from "../StartHereSection";
import XraySection from "../XraySection";
import { LandingRoot } from "./LandingApp.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  databases: PropTypes.array,
  collections: PropTypes.array,
  dashboards: PropTypes.array,
  candidates: PropTypes.array,
  showXrays: PropTypes.bool,
  showOurData: PropTypes.bool,
  showPinNotice: PropTypes.bool,
};

const LandingApp = ({
  user,
  databases,
  collections,
  dashboards,
  candidates,
  showXrays,
  showOurData,
  showPinNotice,
}) => {
  return (
    <LandingRoot>
      <GreetingSection user={user} />
      {databases && collections && dashboards && (
        <Fragment>
          <StartHereSection
            user={user}
            databases={databases}
            dashboards={dashboards}
            showPinNotice={showPinNotice}
          />
          <XraySection
            user={user}
            dashboards={dashboards}
            candidates={candidates}
            showXrays={showXrays}
          />
          <OurAnalyticsSection user={user} collections={collections} />
          <OurDataSection
            user={user}
            databases={databases}
            showOurData={showOurData}
          />
        </Fragment>
      )}
    </LandingRoot>
  );
};

LandingApp.propTypes = propTypes;

export default LandingApp;

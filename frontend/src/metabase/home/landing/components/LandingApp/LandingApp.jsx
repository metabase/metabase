import React, { Fragment } from "react";
import PropTypes from "prop-types";
import GreetingSection from "../GreetingSection";
import CollectionSection from "../CollectionSection";
import DatabaseSection from "../DatabaseSection";
import StartSection from "../StartSection";
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
          <StartSection
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
          <CollectionSection user={user} collections={collections} />
          <DatabaseSection
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

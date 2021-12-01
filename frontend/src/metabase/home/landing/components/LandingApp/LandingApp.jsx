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
  showData: PropTypes.bool,
  showXrays: PropTypes.bool,
  showPinNotice: PropTypes.bool,
  onHideData: PropTypes.func,
  onHideXrays: PropTypes.func,
  onHidePinNotice: PropTypes.func,
};

const LandingApp = ({
  user,
  databases,
  collections,
  dashboards,
  candidates,
  showData,
  showXrays,
  showPinNotice,
  onHideData,
  onHideXrays,
  onHidePinNotice,
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
            onHidePinNotice={onHidePinNotice}
          />
          <XraySection
            user={user}
            dashboards={dashboards}
            candidates={candidates}
            showXrays={showXrays}
            onHideXrays={onHideXrays}
          />
          <CollectionSection user={user} collections={collections} />
          <DatabaseSection
            user={user}
            databases={databases}
            showData={showData}
            onHideData={onHideData}
          />
        </Fragment>
      )}
    </LandingRoot>
  );
};

LandingApp.propTypes = propTypes;

export default LandingApp;

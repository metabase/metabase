import React, { Fragment } from "react";
import PropTypes from "prop-types";
import GreetingSection from "../GreetingSection";
import CollectionSection from "../CollectionSection";
import DatabaseSection from "../DatabaseSection";
import StartSection from "../StartSection";
import XraySection from "../XraySection";
import { LandingRoot } from "./Homepage.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  databases: PropTypes.array,
  collections: PropTypes.array,
  dashboards: PropTypes.array,
  databaseCandidates: PropTypes.array,
  showData: PropTypes.bool,
  showXrays: PropTypes.bool,
  showPinMessage: PropTypes.bool,
  onHideData: PropTypes.func,
  onHideXrays: PropTypes.func,
  onHidePinMessage: PropTypes.func,
};

const Homepage = ({
  user,
  databases,
  collections,
  dashboards,
  databaseCandidates,
  showData,
  showXrays,
  showPinMessage,
  onHideData,
  onHideXrays,
  onHidePinMessage,
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
            showPinMessage={showPinMessage}
            onHidePinMessage={onHidePinMessage}
          />
          <XraySection
            user={user}
            dashboards={dashboards}
            databaseCandidates={databaseCandidates}
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

Homepage.propTypes = propTypes;

export default Homepage;

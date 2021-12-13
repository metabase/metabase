import React, { Fragment } from "react";
import {
  Collection,
  Dashboard,
  Database,
  DatabaseCandidate,
  User,
} from "../../types";
import CollectionSection from "../CollectionSection";
import DatabaseSection from "../DatabaseSection";
import GreetingSection from "../GreetingSection";
import StartSection from "../StartSection";
import XraySection from "../XraySection";
import { LandingRoot } from "./Homepage.styled";
import SyncingSection from "../SyncingSection/SyncingSection";

interface Props {
  user: User;
  databases?: Database[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databaseCandidates?: DatabaseCandidate[];
  showData?: boolean;
  showXrays?: boolean;
  showPinMessage?: boolean;
  showSyncingModal?: boolean;
  onHideData?: () => void;
  onHideXrays?: () => void;
  onHidePinMessage?: () => void;
  onHideSyncingModal?: () => void;
}

const Homepage = ({
  user,
  databases,
  collections,
  dashboards,
  databaseCandidates,
  showData,
  showXrays,
  showPinMessage,
  showSyncingModal,
  onHideData,
  onHideXrays,
  onHidePinMessage,
  onHideSyncingModal,
}: Props) => {
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
          <SyncingSection
            user={user}
            databases={databases}
            showXrays={showXrays}
            showSyncingModal={showSyncingModal}
            onHideSyncingModal={onHideSyncingModal}
          />
        </Fragment>
      )}
    </LandingRoot>
  );
};

export default Homepage;

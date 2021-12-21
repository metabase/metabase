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

export interface HomepageProps {
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
  onCollectionClick?: () => void;
  onDashboardClick?: (dashboard: Dashboard) => void;
  onDatabaseClick?: (database: Database) => void;
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
  onCollectionClick,
  onDashboardClick,
  onDatabaseClick,
}: HomepageProps) => {
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
            onDashboardClick={onDashboardClick}
          />
          <XraySection
            user={user}
            dashboards={dashboards}
            databaseCandidates={databaseCandidates}
            showXrays={showXrays}
            onHideXrays={onHideXrays}
          />
          <CollectionSection
            user={user}
            collections={collections}
            onCollectionClick={onCollectionClick}
          />
          <DatabaseSection
            user={user}
            databases={databases}
            showData={showData}
            onHideData={onHideData}
            onDatabaseClick={onDatabaseClick}
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

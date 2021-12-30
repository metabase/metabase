import React, { Fragment } from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CollectionSection from "../CollectionSection";
import DatabaseSection from "../DatabaseSection";
import GreetingSection from "../GreetingSection";
import StartSection from "../StartSection";
import XraySection from "../XraySection";
import SyncingSection from "../SyncingSection/SyncingSection";
import { HomepageRoot } from "./Homepage.styled";
import {
  Collection,
  Dashboard,
  Database,
  DatabaseCandidate,
  User,
} from "../../types";

export interface HomepageProps {
  user: User;
  databases?: Database[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databaseCandidates?: DatabaseCandidate[];
  showData?: boolean;
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
  showPinMessage,
  showSyncingModal,
  onHideData,
  onHideXrays,
  onHidePinMessage,
  onHideSyncingModal,
  onCollectionClick,
  onDashboardClick,
  onDatabaseClick,
}: HomepageProps): JSX.Element => {
  return (
    <HomepageRoot>
      <GreetingSection user={user} />
      {databases && collections && dashboards ? (
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
            databaseCandidates={databaseCandidates}
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
            showSyncingModal={showSyncingModal}
            onHideSyncingModal={onHideSyncingModal}
          />
        </Fragment>
      ) : (
        <LoadingAndErrorWrapper loading />
      )}
    </HomepageRoot>
  );
};

export default Homepage;

import React, { Fragment } from "react";
import { t } from "ttag";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EmptyState from "metabase/components/EmptyState";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { isSmallScreen } from "metabase/lib/dom";
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
} from "metabase-types/api";

export interface HomepageProps {
  user: User;
  databases?: Database[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databaseCandidates?: DatabaseCandidate[];
  showData?: boolean;
  showPinMessage?: boolean;
  showSyncingModal?: boolean;
  openNavbar: () => void;
  onHideData?: () => void;
  onHideXrays?: () => void;
  onHidePinMessage?: () => void;
  onHideSyncingModal?: () => void;
  onCollectionClick?: () => void;
  onDashboardClick?: (dashboard: Dashboard) => void;
  onDatabaseClick?: (database: Database) => void;
  allError?: boolean;
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
  openNavbar,
  onHideData,
  onHideXrays,
  onHidePinMessage,
  onHideSyncingModal,
  onCollectionClick,
  onDashboardClick,
  onDatabaseClick,
  allError,
}: HomepageProps): JSX.Element => {
  useOnMount(() => {
    if (!isSmallScreen()) {
      openNavbar();
    }
  });

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
      ) : allError ? (
        <EmptyState
          title={t`Something's gone wrong`}
          message={t`We've run into an error. You can try refreshing the page, or just go back.`}
          illustrationElement={
            <div className="QueryError-image QueryError-image--serverError" />
          }
        />
      ) : (
        <LoadingAndErrorWrapper loading />
      )}
    </HomepageRoot>
  );
};

export default Homepage;

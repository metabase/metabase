import type { Location } from "history";
import { type ComponentType, useState } from "react";
import { replace } from "react-router-redux";
import { useInterval, useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { GenericError } from "metabase/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Divider, Flex } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type {
  DatabaseData,
  DatabaseId,
  Database as DatabaseType,
  InitialSyncStatus,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DatabaseConnectionInfoSection } from "../components/DatabaseConnectionInfoSection";
import { DatabaseDangerZoneSection } from "../components/DatabaseDangerZoneSection";
import type { DatabaseEditErrorType } from "../components/DatabaseEditConnectionForm";
import { DatabaseModelFeaturesSection } from "../components/DatabaseModelFeaturesSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
import { NewDatabasePermissionsModal } from "../components/NewDatabasePermissionsModal";
import {
  deleteDatabase,
  dismissSyncSpinner,
  initializeDatabase,
  reset,
  selectEngine,
  updateDatabase,
} from "../database";
import { getEditingDatabase, getInitializeError } from "../selectors";

interface DatabaseEditAppProps {
  children: React.ReactNode;
  database?: Database;
  params: { databaseId: DatabaseId };
  reset: () => void;
  initializeDatabase: (databaseId: DatabaseId) => Promise<void>;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseType>,
  ) => Promise<void>;
  deleteDatabase: (databaseId: DatabaseId) => Promise<void>;
  selectEngine: (engine: string) => void;
  location: Location;
  isAdmin: boolean;
  isModelPersistenceEnabled: boolean;
  initializeError?: DatabaseEditErrorType;
  replace: (path: string) => void;
}

const mapStateToProps = (state: State) => {
  const database = getEditingDatabase(state);

  return {
    database: database ? new Database(database) : undefined,
    initializeError: getInitializeError(state),
    isAdmin: getUserIsAdmin(state),
    isModelPersistenceEnabled: getSetting(state, "persisted-models-enabled"),
  };
};

const mapDispatchToProps = {
  dismissSyncSpinner,
  initializeDatabase,
  reset,
  selectEngine,
  updateDatabase,
  deleteDatabase,
  replace,
};

// loads the database into the redux state and polls until the
// database has been successfully synced for the first time
// ideally this should be ported to RTKQuery
function useDatabaseInitializer(
  reset: () => void,
  initializeDatabase: (databaseId: DatabaseId) => Promise<void>,
  databaseId: DatabaseId,
  initialSyncStatus: InitialSyncStatus | undefined,
) {
  useMount(async () => {
    reset();
    initializeDatabase(databaseId);
  });

  // keep refetching the database until the sync status reached a terminal state
  useInterval(
    () => initializeDatabase(databaseId),
    initialSyncStatus === "incomplete" ? 2000 : null,
  );
}

function DatabaseEditAppInner({
  children,
  database,
  dismissSyncSpinner,
  initializeDatabase,
  initializeError,
  isAdmin,
  isModelPersistenceEnabled,
  params,
  reset,
  updateDatabase,
  deleteDatabase,
  location,
  replace,
}: DatabaseEditAppProps) {
  useDatabaseInitializer(
    reset,
    initializeDatabase,
    params.databaseId,
    database?.initial_sync_status,
  );

  const isLoading = !database?.id && !initializeError;
  const crumbs = _.compact([
    [t`Databases`, "/admin/databases"],
    database?.name && [database?.name],
  ]);

  const [isPermissionModalOpened, setIsPermissionModalOpened] = useState(false);
  useMount(() => {
    if (location.query.created) {
      setIsPermissionModalOpened(true);
      replace(location.pathname);
    }
  });
  const onPermissionModalClose = () => setIsPermissionModalOpened(false);

  return (
    <>
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <Box w="100%" maw="64.25rem" mx="auto" px="2rem">
          <Breadcrumbs className={CS.py4} crumbs={crumbs} />

          <LoadingAndErrorWrapper loading={isLoading} error={initializeError}>
            {database && (
              <>
                <ExistingDatabaseHeader database={database} />

                <Divider mb={{ base: "1.5rem", sm: "3.25rem" }} />

                <Flex
                  direction="column"
                  gap={{ base: "2rem", sm: "5.5rem" }}
                  mb={{ base: "3rem", sm: "5.5rem" }}
                >
                  <DatabaseConnectionInfoSection
                    database={database}
                    dismissSyncSpinner={dismissSyncSpinner}
                  />

                  <DatabaseModelFeaturesSection
                    database={database}
                    isModelPersistenceEnabled={isModelPersistenceEnabled}
                    updateDatabase={updateDatabase}
                  />

                  <DatabaseDangerZoneSection
                    isAdmin={isAdmin}
                    database={database}
                    deleteDatabase={deleteDatabase}
                  />
                </Flex>

                <NewDatabasePermissionsModal
                  opened={isPermissionModalOpened}
                  onClose={onPermissionModalClose}
                  database={database}
                />
              </>
            )}
          </LoadingAndErrorWrapper>
        </Box>
      </ErrorBoundary>
      {children}
    </>
  );
}

export const DatabaseEditApp = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(
    ({ database }: { database: DatabaseData }) => database && database.name,
  ),
)(DatabaseEditAppInner);

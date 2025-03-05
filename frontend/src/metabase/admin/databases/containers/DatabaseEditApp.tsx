import type { Location } from "history";
import type { ComponentType } from "react";
import { useMount } from "react-use";
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
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DatabaseConnectionInfoSection } from "../components/DatabaseConnectionInfoSection";
import { DatabaseDangerZoneSection } from "../components/DatabaseDangerZoneSection";
import type { DatabaseEditErrorType } from "../components/DatabaseEditConnectionForm";
import { DatabaseModelFeaturesSection } from "../components/DatabaseModelFeaturesSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
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
};

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
}: DatabaseEditAppProps) {
  useMount(async () => {
    reset();
    await initializeDatabase(params.databaseId);
  });

  const isLoading = !database && !initializeError;
  const crumbs = _.compact([
    [t`Databases`, "/admin/databases"],
    database?.name && [database?.name],
  ]);

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

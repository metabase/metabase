import type { Location } from "history";
import type { ComponentType } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { GenericError, NotFound } from "metabase/components/ErrorPages";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Divider } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type {
  DatabaseData,
  DatabaseId,
  Database as DatabaseType,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DatabaseConnectionInfoSection } from "../components/DatabaseConnectionInfoSection";
import { DatabaseDangerZoneSection } from "../components/DatabaseDangerZoneSection";
import { DatabaseModelFeaturesSection } from "../components/DatabaseModelFeaturesSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
import {
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
  selectEngine: (engine: string) => void;
  location: Location;
  isAdmin: boolean;
  isModelPersistenceEnabled: boolean;
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
  reset,
  initializeDatabase,
  updateDatabase,
  dismissSyncSpinner,
  selectEngine,
};

function DatabaseEditAppInner({
  children,
  database,
  updateDatabase,
  dismissSyncSpinner,
  isAdmin,
  isModelPersistenceEnabled,
  reset,
  initializeDatabase,
  params,
}: DatabaseEditAppProps) {
  useMount(async () => {
    reset();
    await initializeDatabase(params.databaseId);
  });

  const dbNotFound = !database?.id;

  const crumbs = _.compact([
    [t`Databases`, "/admin/databases"],
    dbNotFound ? null : [t`Add Database`],
  ]);

  // TODO: handle this on a new page
  if (dbNotFound) {
    return (
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <Box w="100%" maw="64.25rem" mx="auto" py="4rem">
          <NotFound />
        </Box>
      </ErrorBoundary>
    );
  }

  return (
    <>
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <Box w="100%" maw="64.25rem" mx="auto" px="2rem">
          <Breadcrumbs className={CS.py4} crumbs={crumbs} />

          <ExistingDatabaseHeader database={database} />

          <Divider mb="3.25rem" />

          <DatabaseConnectionInfoSection
            database={database}
            dismissSyncSpinner={dismissSyncSpinner}
          />

          <DatabaseModelFeaturesSection
            database={database}
            isModelPersistenceEnabled={isModelPersistenceEnabled}
            updateDatabase={updateDatabase}
          />

          <DatabaseDangerZoneSection isAdmin={isAdmin} database={database} />
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

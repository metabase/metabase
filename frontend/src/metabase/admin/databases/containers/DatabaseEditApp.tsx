import { ComponentType, useState } from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import _ from "underscore";
import { updateIn } from "icepick";

import { useMount } from "react-use";
import type { Location } from "history";
import title from "metabase/hoc/Title";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";
import { getUserIsAdmin } from "metabase/selectors/user";

import { getSetting } from "metabase/selectors/settings";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DatabaseForm from "metabase/databases/containers/DatabaseForm";
import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/containers/ErrorPages";
import {
  Database as DatabaseType,
  DatabaseData,
  DatabaseId,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import useBeforeUnload from "metabase/hooks/use-before-unload";
import Database from "metabase-lib/metadata/Database";

import { getEditingDatabase, getInitializeError } from "../selectors";

import {
  reset,
  initializeDatabase,
  saveDatabase,
  updateDatabase,
  syncDatabaseSchema,
  dismissSyncSpinner,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
} from "../database";
import {
  DatabaseEditContent,
  DatabaseEditForm,
  DatabaseEditHelp,
  DatabaseEditMain,
  DatabaseEditRoot,
} from "./DatabaseEditApp.styled";

interface DatabaseEditAppProps {
  database: Database;
  params: { databaseId: DatabaseId };
  reset: () => void;
  initializeDatabase: (databaseId: DatabaseId) => void;
  syncDatabaseSchema: (databaseId: DatabaseId) => Promise<void>;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
  rescanDatabaseFields: (databaseId: DatabaseId) => Promise<void>;
  discardSavedFieldValues: (databaseId: DatabaseId) => Promise<void>;
  deleteDatabase: (
    databaseId: DatabaseId,
    isDetailView: boolean,
  ) => Promise<void>;
  saveDatabase: (database: DatabaseData) => void;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseType>,
  ) => Promise<void>;
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
  reset,
  initializeDatabase,
  saveDatabase,
  updateDatabase,
  syncDatabaseSchema,
  dismissSyncSpinner,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
};

type DatabaseEditErrorType = {
  data: {
    message: string;
    errors: { [key: string]: string };
  };
  statusText: string;
  message: string;
};

function DatabaseEditApp(props: DatabaseEditAppProps) {
  const {
    database,
    deleteDatabase,
    updateDatabase,
    discardSavedFieldValues,
    initializeError,
    rescanDatabaseFields,
    syncDatabaseSchema,
    dismissSyncSpinner,
    isAdmin,
    isModelPersistenceEnabled,
    reset,
    initializeDatabase,
    params,
    saveDatabase,
  } = props;

  const editingExistingDatabase = database?.id != null;
  const addingNewDatabase = !editingExistingDatabase;

  const [isDirty, setIsDirty] = useState(false);

  useBeforeUnload(isDirty);

  useMount(async () => {
    await reset();
    await initializeDatabase(params.databaseId);
  });

  const crumbs = [
    [t`Databases`, "/admin/databases"],
    [addingNewDatabase ? t`Add Database` : database.name],
  ];
  const handleSubmit = async (database: DatabaseData) => {
    try {
      await saveDatabase(database);
    } catch (error) {
      throw getSubmitError(error as DatabaseEditErrorType);
    }
  };

  return (
    <DatabaseEditRoot>
      <Breadcrumbs className="py4" crumbs={crumbs} />

      <DatabaseEditMain>
        <ErrorBoundary errorComponent={GenericError as ComponentType}>
          <div>
            <div className="pt0">
              <LoadingAndErrorWrapper
                loading={!database}
                error={initializeError}
              >
                <DatabaseEditContent>
                  <DatabaseEditForm>
                    <DatabaseForm
                      initialValues={database}
                      isAdvanced
                      onSubmit={handleSubmit}
                      setIsDirty={setIsDirty}
                    />
                  </DatabaseEditForm>
                  <div>{addingNewDatabase && <DatabaseEditHelp />}</div>
                </DatabaseEditContent>
              </LoadingAndErrorWrapper>
            </div>
          </div>
        </ErrorBoundary>

        {editingExistingDatabase && (
          <Sidebar
            database={database}
            isAdmin={isAdmin}
            isModelPersistenceEnabled={isModelPersistenceEnabled}
            updateDatabase={updateDatabase}
            deleteDatabase={deleteDatabase}
            discardSavedFieldValues={discardSavedFieldValues}
            rescanDatabaseFields={rescanDatabaseFields}
            syncDatabaseSchema={syncDatabaseSchema}
            dismissSyncSpinner={dismissSyncSpinner}
          />
        )}
      </DatabaseEditMain>
    </DatabaseEditRoot>
  );
}

const getSubmitError = (error: DatabaseEditErrorType) => {
  if (_.isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], errors => ({
      details: errors,
    }));
  }

  return error;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(
    ({ database }: { database: DatabaseData }) => database && database.name,
  ),
)(DatabaseEditApp);

import type { Location, LocationDescriptor } from "history";
import { updateIn } from "icepick";
import type { ComponentType } from "react";
import { useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { GenericError } from "metabase/components/ErrorPages";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import title from "metabase/hoc/Title";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Divider, Flex, Text } from "metabase/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type {
  DatabaseData,
  DatabaseId,
  Database as DatabaseType,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DatabaseInfoSection } from "../components/DatabaseInfoSection";
import { ExistingDatabaseHeader } from "../components/ExistingDatabaseHeader";
import {
  deleteDatabase,
  dismissSyncSpinner,
  initializeDatabase,
  reset,
  saveDatabase,
  selectEngine,
  updateDatabase,
} from "../database";
import { getEditingDatabase, getInitializeError } from "../selectors";

import { DatabaseEditHelp } from "./DatabaseEditApp.styled";

interface DatabaseEditAppProps {
  database?: Database;
  params: { databaseId: DatabaseId };
  reset: () => void;
  initializeDatabase: (databaseId: DatabaseId) => void;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
  deleteDatabase: (
    databaseId: DatabaseId,
    isDetailView: boolean,
  ) => Promise<void>;
  saveDatabase: (database: DatabaseData) => Database;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseType>,
  ) => Promise<void>;
  selectEngine: (engine: string) => void;
  location: Location;
  isAdmin: boolean;
  isModelPersistenceEnabled: boolean;
  initializeError?: DatabaseEditErrorType;
  route: Route;
  onChangeLocation: (location: LocationDescriptor) => void;
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
  dismissSyncSpinner,
  deleteDatabase,
  selectEngine,
  onChangeLocation: push,
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
    initializeError,
    dismissSyncSpinner,
    isAdmin,
    isModelPersistenceEnabled,
    reset,
    initializeDatabase,
    params,
    saveDatabase,
    route,
    onChangeLocation,
  } = props;

  const editingExistingDatabase = database?.id != null;
  const addingNewDatabase = !editingExistingDatabase;

  const [isDirty, setIsDirty] = useState(false);

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

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
      const savedDB = await saveDatabase(database);
      if (addingNewDatabase) {
        scheduleCallback(() => {
          onChangeLocation(
            `/admin/databases?created=true&createdDbId=${savedDB.id}`,
          );
        });
      }
    } catch (error) {
      throw getSubmitError(error as DatabaseEditErrorType);
    }
  };

  const autofocusFieldName = window.location.hash.slice(1);

  return (
    <Box w="100%" maw="64.25rem" mx="auto" px="2rem">
      <Breadcrumbs className={CS.py4} crumbs={crumbs} />

      {!addingNewDatabase && (
        <>
          <ExistingDatabaseHeader database={database} />
          <Divider mb="3.25rem" />
        </>
      )}

      <DatabaseInfoSection
        name={t`Connection and sync`}
        description={t`Manage details about the database connection and when Metabase ingests new data.`}
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap="xs">
            <Box
              w=".75rem"
              h=".75rem"
              style={{ borderRadius: "50%", background: "green" }}
            />
            <Text c="black">{(database?.details?.host as any) ?? ""}</Text>
          </Flex>
          <Button>{t`Edit`}</Button>
        </Flex>
      </DatabaseInfoSection>

      <Flex mb="md">
        <ErrorBoundary errorComponent={GenericError as ComponentType}>
          <div>
            <div className={CS.pt0}>
              <LoadingAndErrorWrapper
                loading={!database}
                error={initializeError}
              >
                {editingExistingDatabase && database.is_attached_dwh ? (
                  <div>{t`This database cannot be modified.`}</div>
                ) : (
                  <Flex>
                    <Box w="38.5rem">
                      <DatabaseForm
                        initialValues={database}
                        isAdvanced
                        onSubmit={handleSubmit}
                        setIsDirty={setIsDirty}
                        autofocusFieldName={autofocusFieldName}
                      />
                    </Box>
                    <div>{addingNewDatabase && <DatabaseEditHelp />}</div>
                  </Flex>
                )}
              </LoadingAndErrorWrapper>
            </div>
          </div>
        </ErrorBoundary>

        {editingExistingDatabase && !database.is_attached_dwh && (
          <Sidebar
            database={database}
            isAdmin={isAdmin}
            isModelPersistenceEnabled={isModelPersistenceEnabled}
            updateDatabase={updateDatabase}
            deleteDatabase={deleteDatabase}
            dismissSyncSpinner={dismissSyncSpinner}
          />
        )}
      </Flex>

      <LeaveConfirmationModal
        isEnabled={isDirty && !isCallbackScheduled}
        route={route}
      />
    </Box>
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

/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { t } from "ttag";
import _ from "underscore";
import { updateIn } from "icepick";

import title from "metabase/hoc/Title";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";
import { getUserIsAdmin } from "metabase/selectors/user";

import { getSetting } from "metabase/selectors/settings";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DatabaseForm from "metabase/databases/containers/DatabaseForm";
import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/containers/ErrorPages";
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

const mapStateToProps = state => {
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

class DatabaseEditApp extends Component {
  constructor(props, context) {
    super(props, context);
  }

  static propTypes = {
    database: PropTypes.object,
    metadata: PropTypes.object,
    params: PropTypes.object.isRequired,
    reset: PropTypes.func.isRequired,
    initializeDatabase: PropTypes.func.isRequired,
    syncDatabaseSchema: PropTypes.func.isRequired,
    dismissSyncSpinner: PropTypes.func.isRequired,
    rescanDatabaseFields: PropTypes.func.isRequired,
    discardSavedFieldValues: PropTypes.func.isRequired,
    deleteDatabase: PropTypes.func.isRequired,
    saveDatabase: PropTypes.func.isRequired,
    updateDatabase: PropTypes.func.isRequired,
    selectEngine: PropTypes.func.isRequired,
    location: PropTypes.object,
    isAdmin: PropTypes.bool,
    isModelPersistenceEnabled: PropTypes.bool,
  };

  async componentDidMount() {
    await this.props.reset();
    await this.props.initializeDatabase(this.props.params.databaseId);
  }

  render() {
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
    } = this.props;
    const editingExistingDatabase = database?.id != null;
    const addingNewDatabase = !editingExistingDatabase;

    const crumbs = [
      [t`Databases`, "/admin/databases"],
      [addingNewDatabase ? t`Add Database` : database.name],
    ];

    const handleSubmit = async database => {
      try {
        await this.props.saveDatabase(database);
      } catch (error) {
        throw getSubmitError(error);
      }
    };

    return (
      <DatabaseEditRoot>
        <Breadcrumbs className="py4" crumbs={crumbs} />

        <DatabaseEditMain>
          <ErrorBoundary errorComponent={GenericError}>
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
}

const getSubmitError = error => {
  if (_.isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], errors => ({
      details: errors,
    }));
  }

  return error;
};

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ database }) => database && database.name),
)(DatabaseEditApp);

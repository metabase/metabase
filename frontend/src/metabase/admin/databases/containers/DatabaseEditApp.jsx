/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { compose } from "redux";

import { t } from "ttag";
import { isObject, reject } from "lodash";
import { updateIn } from "icepick";

import title from "metabase/hoc/Title";

import Button from "metabase/core/components/Button";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import FormError from "metabase/components/form/FormError";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";
import DriverWarning from "metabase/containers/DriverWarning";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getErrorMessageWithBoldFields } from "metabase/lib/form";

import Databases from "metabase/entities/databases";
import { getSetting } from "metabase/selectors/settings";

import Database from "metabase-lib/lib/metadata/Database";

import { getEditingDatabase, getInitializeError } from "../selectors";

import {
  reset,
  initializeDatabase,
  saveDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
  persistDatabase,
  unpersistDatabase,
} from "../database";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  DatabaseEditContent,
  DatabaseEditForm,
  DatabaseEditHelp,
  DatabaseEditMain,
  DatabaseEditRoot,
} from "./DatabaseEditApp.styled";

const DATABASE_FORM_NAME = "database";

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
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  persistDatabase,
  unpersistDatabase,
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
    rescanDatabaseFields: PropTypes.func.isRequired,
    discardSavedFieldValues: PropTypes.func.isRequired,
    persistDatabase: PropTypes.func.isRequired,
    unpersistDatabase: PropTypes.func.isRequired,
    deleteDatabase: PropTypes.func.isRequired,
    saveDatabase: PropTypes.func.isRequired,
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
      discardSavedFieldValues,
      initializeError,
      rescanDatabaseFields,
      syncDatabaseSchema,
      persistDatabase,
      unpersistDatabase,
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
          <div>
            <div className="pt0">
              <LoadingAndErrorWrapper
                loading={!database}
                error={initializeError}
              >
                {() => (
                  <Databases.Form
                    database={database}
                    form={Databases.forms.details}
                    formName={DATABASE_FORM_NAME}
                    onSubmit={handleSubmit}
                    submitTitle={addingNewDatabase ? t`Save` : t`Save changes`}
                    submitButtonComponent={Button}
                  >
                    {({
                      Form,
                      FormField,
                      FormSubmit,
                      formFields,
                      values,
                      submitTitle,
                      onChangeField,
                      error,
                    }) => {
                      return (
                        <DatabaseEditContent>
                          <DatabaseEditForm>
                            <Form>
                              <FormField
                                name="engine"
                                disabled={database.is_sample}
                              />
                              <DriverWarning
                                engine={values.engine}
                                onChange={engine =>
                                  onChangeField("engine", engine)
                                }
                              />
                              <FormError
                                className="mt3 mb4"
                                anchorMarginTop={24}
                                error={getErrorMessageWithBoldFields(
                                  error,
                                  formFields,
                                )}
                              />
                              {reject(formFields, { name: "engine" }).map(
                                ({ name }) => (
                                  <FormField key={name} name={name} />
                                ),
                              )}
                              <div className="Form-actions text-centered">
                                <FormSubmit className="block mb2">
                                  {submitTitle}
                                </FormSubmit>
                              </div>
                            </Form>
                          </DatabaseEditForm>
                          <div>{addingNewDatabase && <DatabaseEditHelp />}</div>
                        </DatabaseEditContent>
                      );
                    }}
                  </Databases.Form>
                )}
              </LoadingAndErrorWrapper>
            </div>
          </div>

          {editingExistingDatabase && (
            <Sidebar
              database={database}
              isAdmin={isAdmin}
              isModelPersistenceEnabled={isModelPersistenceEnabled}
              deleteDatabase={deleteDatabase}
              discardSavedFieldValues={discardSavedFieldValues}
              rescanDatabaseFields={rescanDatabaseFields}
              syncDatabaseSchema={syncDatabaseSchema}
              persistDatabase={persistDatabase}
              unpersistDatabase={unpersistDatabase}
            />
          )}
        </DatabaseEditMain>
      </DatabaseEditRoot>
    );
  }
}

const getSubmitError = error => {
  if (isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], errors => ({
      details: errors,
    }));
  }

  return error;
};

export default compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ database }) => database && database.name),
)(DatabaseEditApp);

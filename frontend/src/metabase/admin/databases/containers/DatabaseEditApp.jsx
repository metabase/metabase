/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getValues } from "redux-form";

import { t } from "ttag";
import _ from "underscore";

import title from "metabase/hoc/Title";

import Button from "metabase/core/components/Button";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";
import DriverWarning from "metabase/containers/DriverWarning";
import { getUserIsAdmin } from "metabase/selectors/user";

import Databases from "metabase/entities/databases";

import {
  getEditingDatabase,
  getDatabaseCreationStep,
  getInitializeError,
} from "../selectors";

import {
  reset,
  initializeDatabase,
  saveDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
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
  const formValues = getValues(state.form[DATABASE_FORM_NAME]);
  return {
    database,
    databaseCreationStep: getDatabaseCreationStep(state),
    selectedEngine: formValues ? formValues.engine : undefined,
    initializeError: getInitializeError(state),
    isAdmin: getUserIsAdmin(state),
  };
};

const mapDispatchToProps = {
  reset,
  initializeDatabase,
  saveDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ database }) => database && database.name)
export default class DatabaseEditApp extends Component {
  constructor(props, context) {
    super(props, context);
  }

  static propTypes = {
    database: PropTypes.object,
    databaseCreationStep: PropTypes.string,
    params: PropTypes.object.isRequired,
    reset: PropTypes.func.isRequired,
    initializeDatabase: PropTypes.func.isRequired,
    syncDatabaseSchema: PropTypes.func.isRequired,
    rescanDatabaseFields: PropTypes.func.isRequired,
    discardSavedFieldValues: PropTypes.func.isRequired,
    deleteDatabase: PropTypes.func.isRequired,
    saveDatabase: PropTypes.func.isRequired,
    selectEngine: PropTypes.func.isRequired,
    location: PropTypes.object,
    isAdmin: PropTypes.bool,
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
      selectedEngine,
      initializeError,
      rescanDatabaseFields,
      syncDatabaseSchema,
      isAdmin,
    } = this.props;
    const editingExistingDatabase = database?.id != null;
    const addingNewDatabase = !editingExistingDatabase;

    const crumbs = [
      [t`Databases`, "/admin/databases"],
      [addingNewDatabase ? t`Add Database` : database.name],
    ];

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
                    form={Databases.forms.connection}
                    formName={DATABASE_FORM_NAME}
                    onSubmit={this.props.saveDatabase}
                    submitTitle={addingNewDatabase ? t`Save` : t`Save changes`}
                    submitButtonComponent={Button}
                  >
                    {({
                      Form,
                      FormField,
                      FormMessage,
                      FormSubmit,
                      formFields,
                      values,
                      submitTitle,
                      onChangeField,
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
                              {_.reject(formFields, { name: "engine" }).map(
                                ({ name }) => (
                                  <FormField key={name} name={name} />
                                ),
                              )}
                              <FormMessage />
                              <div className="Form-actions text-centered">
                                <FormSubmit className="block mb2">
                                  {submitTitle}
                                </FormSubmit>
                              </div>
                            </Form>
                          </DatabaseEditForm>
                          <div>
                            {addingNewDatabase && (
                              <DatabaseEditHelp engine={selectedEngine} />
                            )}
                          </div>
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
              isAdmin={isAdmin}
              database={database}
              deleteDatabase={deleteDatabase}
              discardSavedFieldValues={discardSavedFieldValues}
              rescanDatabaseFields={rescanDatabaseFields}
              syncDatabaseSchema={syncDatabaseSchema}
            />
          )}
        </DatabaseEditMain>
      </DatabaseEditRoot>
    );
  }
}

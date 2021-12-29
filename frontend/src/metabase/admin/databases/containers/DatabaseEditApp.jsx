/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getValues } from "redux-form";

import { t } from "ttag";

import { Box, Flex } from "grid-styled";

import title from "metabase/hoc/Title";

import AddDatabaseHelpCard from "metabase/components/AddDatabaseHelpCard";
import Button from "metabase/components/Button";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import DriverWarning from "metabase/components/DriverWarning";
import Sidebar from "metabase/admin/databases/components/DatabaseEditApp/Sidebar/Sidebar";

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

const DATABASE_FORM_NAME = "database";

const mapStateToProps = state => {
  const database = getEditingDatabase(state);
  const formValues = getValues(state.form[DATABASE_FORM_NAME]);
  return {
    database,
    databaseCreationStep: getDatabaseCreationStep(state),
    selectedEngine: formValues ? formValues.engine : undefined,
    initializeError: getInitializeError(state),
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
    } = this.props;
    const editingExistingDatabase = database?.id != null;
    const addingNewDatabase = !editingExistingDatabase;

    const crumbs = [
      [t`Databases`, "/admin/databases"],
      [addingNewDatabase ? t`Add Database` : database.name],
    ];

    return (
      <Box px={[3, 4, 5]} mt={[1, 2, 3]}>
        <Breadcrumbs className="py4" crumbs={crumbs} />

        <Flex pb={2}>
          <Box>
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
                      onChangeField,
                      submitTitle,
                    }) => {
                      return (
                        <Flex>
                          <Box width={620}>
                            <Form>
                              {formFields.map(formField => (
                                <FormField
                                  key={formField.name}
                                  name={formField.name}
                                />
                              ))}
                              <FormMessage />
                              <div className="Form-actions text-centered">
                                <FormSubmit className="block mb2">
                                  {submitTitle}
                                </FormSubmit>
                              </div>
                            </Form>
                          </Box>
                          <Box>
                            {addingNewDatabase && (
                              <AddDatabaseHelpCard
                                engine={selectedEngine}
                                ml={26}
                                data-testid="database-setup-help-card"
                              />
                            )}
                            <DriverWarning
                              engine={selectedEngine}
                              ml={26}
                              onChangeEngine={engine => {
                                onChangeField("engine", engine);
                              }}
                            />
                          </Box>
                        </Flex>
                      );
                    }}
                  </Databases.Form>
                )}
              </LoadingAndErrorWrapper>
            </div>
          </Box>

          {editingExistingDatabase && (
            <Sidebar
              database={database}
              deleteDatabase={deleteDatabase}
              discardSavedFieldValues={discardSavedFieldValues}
              rescanDatabaseFields={rescanDatabaseFields}
              syncDatabaseSchema={syncDatabaseSchema}
            />
          )}
        </Flex>
      </Box>
    );
  }
}

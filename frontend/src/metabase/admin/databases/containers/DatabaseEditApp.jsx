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
import Radio from "metabase/components/Radio";
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
  proceedWithDbCreation,
  saveDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
} from "../database";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getIn } from "icepick";

const DATABASE_FORM_NAME = "database";

const getLetUserControlScheduling = database =>
  getIn(database, ["details", "let-user-control-scheduling"]);

const mapStateToProps = (state, props) => {
  const database = getEditingDatabase(state);
  const formValues = getValues(state.form[DATABASE_FORM_NAME]);
  return {
    database,
    databaseCreationStep: getDatabaseCreationStep(state),
    selectedEngine: formValues ? formValues.engine : undefined,
    letUserControlSchedulingSaved: getLetUserControlScheduling(database),
    letUserControlSchedulingForm: getLetUserControlScheduling(formValues),
    initializeError: getInitializeError(state),
  };
};

const mapDispatchToProps = {
  reset,
  initializeDatabase,
  proceedWithDbCreation,
  saveDatabase,
  syncDatabaseSchema,
  rescanDatabaseFields,
  discardSavedFieldValues,
  deleteDatabase,
  selectEngine,
};

const TABS = [
  {
    name: t`Connection`,
    value: "connection",
  },
  {
    name: t`Scheduling`,
    value: "scheduling",
  },
];

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@title(({ database }) => database && database.name)
export default class DatabaseEditApp extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      currentTab: TABS[0].value,
    };
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
    proceedWithDbCreation: PropTypes.func.isRequired,
    deleteDatabase: PropTypes.func.isRequired,
    saveDatabase: PropTypes.func.isRequired,
    selectEngine: PropTypes.func.isRequired,
    location: PropTypes.object,
  };

  async UNSAFE_componentWillMount() {
    await this.props.reset();
    await this.props.initializeDatabase(this.props.params.databaseId);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const isNew = !nextProps.database || !nextProps.database.id;
    if (isNew) {
      // Update the current creation step (= active tab) if adding a new database
      this.setState({ currentTab: nextProps.databaseCreationStep });
    }
  }

  render() {
    const {
      database,
      deleteDatabase,
      discardSavedFieldValues,
      selectedEngine,
      letUserControlSchedulingSaved,
      letUserControlSchedulingForm,
      initializeError,
      rescanDatabaseFields,
      syncDatabaseSchema,
    } = this.props;
    const { currentTab } = this.state;
    const editingExistingDatabase = database?.id != null;
    const addingNewDatabase = !editingExistingDatabase;

    const showTabs = editingExistingDatabase && letUserControlSchedulingSaved;

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
              {showTabs && (
                <div className="border-bottom mb2">
                  <Radio
                    value={currentTab}
                    options={TABS}
                    onChange={currentTab => this.setState({ currentTab })}
                    variant="underlined"
                  />
                </div>
              )}
              <LoadingAndErrorWrapper
                loading={!database}
                error={initializeError}
              >
                {() => (
                  <Databases.Form
                    database={database}
                    form={Databases.forms[currentTab]}
                    formName={DATABASE_FORM_NAME}
                    onSubmit={
                      addingNewDatabase && currentTab === "connection"
                        ? this.props.proceedWithDbCreation
                        : this.props.saveDatabase
                    }
                    submitTitle={addingNewDatabase ? t`Save` : t`Save changes`}
                    renderSubmit={
                      // override use of ActionButton for the `Next` button, for adding a new database in which
                      // scheduling is being overridden
                      addingNewDatabase &&
                      currentTab === "connection" &&
                      letUserControlSchedulingForm &&
                      (({ handleSubmit, canSubmit }) => (
                        <Button
                          primary={canSubmit}
                          disabled={!canSubmit}
                          onClick={handleSubmit}
                        >
                          {t`Next`}
                        </Button>
                      ))
                    }
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
                              {formFields.map(formField => {
                                return (
                                  <FormField
                                    key={formField.name}
                                    name={formField.name}
                                  />
                                );
                              })}
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
                              data-testid="database-setup-driver-warning"
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

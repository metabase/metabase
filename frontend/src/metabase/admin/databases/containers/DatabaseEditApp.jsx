/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getValues } from "redux-form";

import { t } from "ttag";

import { Box, Flex } from "grid-styled";

import title from "metabase/hoc/Title";

import DeleteDatabaseModal from "../components/DeleteDatabaseModal";
import ActionButton from "metabase/components/ActionButton";
import AddDatabaseHelpCard from "metabase/components/AddDatabaseHelpCard";
import Button from "metabase/components/Button";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import DriverWarning from "metabase/components/DriverWarning";
import Radio from "metabase/components/Radio";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

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
import ConfirmContent from "metabase/components/ConfirmContent";
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

type TabName = "connection" | "scheduling";
type TabOption = { name: string, value: TabName };

const TABS: TabOption[] = [
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
  state: {
    currentTab: TabName,
  };

  constructor(props, context) {
    super(props, context);

    this.state = {
      currentTab: TABS[0].value,
    };

    this.discardSavedFieldValuesModal = React.createRef();
    this.deleteDatabaseModal = React.createRef();
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
      selectedEngine,
      letUserControlSchedulingSaved,
      letUserControlSchedulingForm,
      initializeError,
    } = this.props;
    const { currentTab } = this.state;
    const editingExistingDatabase = database && database.id != null;
    const addingNewDatabase = !editingExistingDatabase;

    const showTabs = editingExistingDatabase && letUserControlSchedulingSaved;

    return (
      <Box px={[3, 4, 5]} mt={[1, 2, 3]}>
        <Breadcrumbs
          className="py4"
          crumbs={[
            [t`Databases`, "/admin/databases"],
            [addingNewDatabase ? t`Add Database` : database.name],
          ]}
        />
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
              <Flex>
                <Box width={620}>
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
                        submitTitle={
                          addingNewDatabase ? t`Save` : t`Save changes`
                        }
                        renderSubmit={
                          // override use of ActionButton for the `Next` button
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
                      />
                    )}
                  </LoadingAndErrorWrapper>
                </Box>
                <Box>
                  <DriverWarning
                    engine={selectedEngine}
                    ml={26}
                    data-testid="database-setup-driver-warning"
                  />
                  {addingNewDatabase && (
                    <AddDatabaseHelpCard
                      engine={selectedEngine}
                      ml={26}
                      data-testid="database-setup-help-card"
                    />
                  )}
                </Box>
              </Flex>
            </div>
          </Box>

          {/* Sidebar Actions */}
          {editingExistingDatabase && (
            <Box ml={[2, 3]} width={420}>
              <div className="Actions bg-light rounded p3">
                <div className="Actions-group">
                  <label className="Actions-groupLabel block text-bold">{t`Actions`}</label>
                  <ol>
                    <li>
                      <ActionButton
                        actionFn={() =>
                          this.props.syncDatabaseSchema(database.id)
                        }
                        className="Button Button--syncDbSchema"
                        normalText={t`Sync database schema now`}
                        activeText={t`Starting…`}
                        failedText={t`Failed to sync`}
                        successText={t`Sync triggered!`}
                      />
                    </li>
                    <li className="mt2">
                      <ActionButton
                        actionFn={() =>
                          this.props.rescanDatabaseFields(database.id)
                        }
                        className="Button Button--rescanFieldValues"
                        normalText={t`Re-scan field values now`}
                        activeText={t`Starting…`}
                        failedText={t`Failed to start scan`}
                        successText={t`Scan triggered!`}
                      />
                    </li>
                  </ol>
                </div>

                <div className="Actions-group">
                  <label className="Actions-groupLabel block text-bold">{t`Danger Zone`}</label>
                  <ol>
                    <li>
                      <ModalWithTrigger
                        ref={this.discardSavedFieldValuesModal}
                        triggerClasses="Button Button--danger Button--discardSavedFieldValues"
                        triggerElement={t`Discard saved field values`}
                      >
                        <ConfirmContent
                          title={t`Discard saved field values`}
                          onClose={() =>
                            this.discardSavedFieldValuesModal.current.toggle()
                          }
                          onAction={() =>
                            this.props.discardSavedFieldValues(database.id)
                          }
                        />
                      </ModalWithTrigger>
                    </li>

                    <li className="mt2">
                      <ModalWithTrigger
                        ref={this.deleteDatabaseModal}
                        triggerClasses="Button Button--deleteDatabase Button--danger"
                        triggerElement={t`Remove this database`}
                      >
                        <DeleteDatabaseModal
                          database={database}
                          onClose={() =>
                            this.deleteDatabaseModal.current.toggle()
                          }
                          onDelete={() =>
                            this.props.deleteDatabase(database.id, true)
                          }
                        />
                      </ModalWithTrigger>
                    </li>
                  </ol>
                </div>
              </div>
            </Box>
          )}
        </Flex>
      </Box>
    );
  }
}

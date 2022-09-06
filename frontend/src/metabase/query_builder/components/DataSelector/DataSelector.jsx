/* eslint-disable react/prop-types */
import React, { Component, useEffect, useState } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import {
  isVirtualCardId,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase/lib/saved-questions";

import EmptyState from "metabase/components/EmptyState";
import ListSearchField from "metabase/components/ListSearchField";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import MetabaseSettings from "metabase/lib/settings";
import { getSchemaName } from "metabase/lib/schema";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import Search from "metabase/entities/search";

import { PLUGIN_MODERATION } from "metabase/plugins";

import {
  SearchResults,
  convertSearchResultToTableLikeItem,
} from "./data-search";
import SavedQuestionPicker from "./saved-question-picker/SavedQuestionPicker";
import DatabasePicker from "./DataSelectorDatabasePicker";
import DatabaseSchemaPicker from "./DataSelectorDatabaseSchemaPicker";
import SchemaPicker from "./DataSelectorSchemaPicker";
import FieldPicker from "./DataSelectorFieldPicker";
import TablePicker from "./DataSelectorTablePicker";
import {
  DataBucketList,
  DataBucketListItem,
  CollectionDatasetSelectList,
  CollectionDatasetAllDataLink,
  EmptyStateContainer,
} from "./DataSelector.styled";

import { getMetadata } from "metabase/selectors/metadata";
import { getHasDataAccess } from "metabase/new_query/selectors";

import "./DataSelector.css";

const MIN_SEARCH_LENGTH = 2;

export const DATA_BUCKET = {
  DATASETS: "datasets",
  RAW_DATA: "raw-data",
  SAVED_QUESTIONS: "saved-questions",
};

// chooses a data source bucket (datasets / raw data (tables) / saved questions)
const DATA_BUCKET_STEP = "BUCKET";
// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table field (table has already been selected)
const FIELD_STEP = "FIELD";

// allows to choose one of collection's dataset (requires collectionId prop)
// is used while adding a question with the "+" button on collection page
const COLLECTION_DATASET_STEP = "COLLECTION_DATASET";

export const DataSourceSelector = props => (
  <DataSelector
    steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
    combineDatabaseSchemaSteps
    getTriggerElementContent={TableTriggerContent}
    {...props}
  />
);

export const CollectionDatasetOrDataSourceSelector = ({
  hasCollectionDatasetsStep,
  ...props
}) => {
  const [collectionDatasetsShown, setCollectionDatasetsShown] = useState(
    !!hasCollectionDatasetsStep,
  );

  const steps = collectionDatasetsShown
    ? [COLLECTION_DATASET_STEP]
    : [DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP];

  return (
    <DataSelector
      steps={steps}
      combineDatabaseSchemaSteps
      getTriggerElementContent={TableTriggerContent}
      {...props}
      onCloseCollectionDatasets={() => {
        setCollectionDatasetsShown(false);
      }}
    />
  );
};

export const DatabaseDataSelector = props => (
  <DataSelector
    steps={[DATABASE_STEP]}
    getTriggerElementContent={DatabaseTriggerContent}
    {...props}
  />
);

export const DatabaseSchemaAndTableDataSelector = props => (
  <DataSelector
    steps={[DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
    combineDatabaseSchemaSteps
    getTriggerElementContent={TableTriggerContent}
    {...props}
  />
);

export const SchemaAndTableDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_STEP, TABLE_STEP]}
    getTriggerElementContent={TableTriggerContent}
    {...props}
  />
);

export const SchemaTableAndFieldDataSelector = props => (
  <DataSelector
    steps={[SCHEMA_STEP, TABLE_STEP, FIELD_STEP]}
    getTriggerElementContent={FieldTriggerContent}
    {...props}
  />
);

const DatabaseTriggerContent = ({ selectedDatabase }) =>
  selectedDatabase ? (
    <span className="text-wrap text-grey no-decoration">
      {selectedDatabase.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a database`}</span>
  );

const TableTriggerContent = ({ selectedTable }) =>
  selectedTable ? (
    <span className="text-wrap text-grey no-decoration">
      {selectedTable.display_name || selectedTable.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a table`}</span>
  );

const FieldTriggerContent = ({ selectedDatabase, selectedField }) => {
  if (!selectedField || !selectedField.table) {
    return (
      <span className="flex-full text-medium no-decoration">{t`Select...`}</span>
    );
  } else {
    const hasMultipleSchemas =
      selectedDatabase &&
      _.uniq(selectedDatabase.tables, t => t.schema_name).length > 1;
    return (
      <div className="flex-full cursor-pointer">
        <div className="h6 text-bold text-uppercase text-light">
          {hasMultipleSchemas && selectedField.table.schema_name + " > "}
          {selectedField.table.display_name}
        </div>
        <div className="h4 text-bold text-default">
          {selectedField.display_name}
        </div>
      </div>
    );
  }
};

class DataSelectorInner extends Component {
  render() {
    return <UnconnectedDataSelector {...this.props} />;
  }
}

const DataSelector = _.compose(
  Search.loadList({
    // If there is at least one dataset,
    // we want to display a slightly different data picker view
    // (see DATA_BUCKET step)
    query: {
      models: "dataset",
      limit: 1,
    },
    loadingAndErrorWrapper: false,
  }),
  connect(
    (state, ownProps) => ({
      metadata: getMetadata(state),
      databases:
        ownProps.databases ||
        Databases.selectors.getList(state, {
          entityQuery: ownProps.databaseQuery,
        }) ||
        [],
      hasLoadedDatabasesWithTablesSaved: Databases.selectors.getLoaded(state, {
        entityQuery: { include: "tables", saved: true },
      }),
      hasLoadedDatabasesWithSaved: Databases.selectors.getLoaded(state, {
        entityQuery: { saved: true },
      }),
      hasLoadedDatabasesWithTables: Databases.selectors.getLoaded(state, {
        entityQuery: { include: "tables" },
      }),
      hasDataAccess: getHasDataAccess(state),
    }),
    {
      fetchDatabases: databaseQuery =>
        Databases.actions.fetchList(databaseQuery),
      fetchSchemas: databaseId =>
        Schemas.actions.fetchList({ dbId: databaseId }),
      fetchSchemaTables: schemaId => Schemas.actions.fetch({ id: schemaId }),
      fetchFields: tableId => Tables.actions.fetchMetadata({ id: tableId }),
    },
  ),
)(DataSelectorInner);

export class UnconnectedDataSelector extends Component {
  constructor(props) {
    super();

    const state = {
      selectedDataBucketId: props.selectedDataBucketId,
      selectedDatabaseId: props.selectedDatabaseId,
      selectedSchemaId: props.selectedSchemaId,
      selectedTableId: props.selectedTableId,
      selectedFieldId: props.selectedFieldId,
      searchText: "",
      isSavedQuestionPickerShown: false,
    };
    const computedState = this._getComputedState(props, state);
    this.state = {
      activeStep: null,
      isLoading: false,
      isError: false,
      ...state,
      ...computedState,
    };
    this.popover = React.createRef();
  }

  static propTypes = {
    selectedDataBucketId: PropTypes.number,
    selectedDatabaseId: PropTypes.number,
    selectedSchemaId: PropTypes.string,
    selectedTableId: PropTypes.number,
    selectedFieldId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    setDatabaseFn: PropTypes.func,
    setFieldFn: PropTypes.func,
    setSourceTableFn: PropTypes.func,
    hideSingleSchema: PropTypes.bool,
    hideSingleDatabase: PropTypes.bool,
    useOnlyAvailableDatabase: PropTypes.bool,
    useOnlyAvailableSchema: PropTypes.bool,
    isInitiallyOpen: PropTypes.bool,
    renderAsSelect: PropTypes.bool,
    tableFilter: PropTypes.func,
    hasTableSearch: PropTypes.bool,
    canChangeDatabase: PropTypes.bool,
    containerClassName: PropTypes.string,
    requireWriteback: PropTypes.bool,

    // from search entity list loader
    allError: PropTypes.bool,
    allFetched: PropTypes.bool,
    allLoaded: PropTypes.bool,
    allLoading: PropTypes.bool,
    loaded: PropTypes.bool,
    loading: PropTypes.bool,
    fetched: PropTypes.bool,
    fetch: PropTypes.func,
    create: PropTypes.func,
    update: PropTypes.func,
    delete: PropTypes.func,
    reload: PropTypes.func,
    list: PropTypes.arrayOf(PropTypes.object),
    search: PropTypes.arrayOf(PropTypes.object),
  };

  static defaultProps = {
    isInitiallyOpen: false,
    renderAsSelect: false,
    useOnlyAvailableDatabase: true,
    useOnlyAvailableSchema: true,
    hideSingleSchema: true,
    hideSingleDatabase: false,
    hasTableSearch: false,
    canChangeDatabase: true,
    hasTriggerExpandControl: true,
  };

  // computes selected metadata objects (`selectedDatabase`, etc) and options (`databases`, etc)
  // from props (`metadata`, `databases`, etc) and state (`selectedDatabaseId`, etc)
  //
  // NOTE: this is complicated because we allow you to:
  // 1. pass in databases/schemas/tables/fields as props
  // 2. pull them from the currently selected "parent" metadata object
  // 3. pull them out of metadata
  //
  // We also want to recompute the selected objects from their selected ID
  // each time rather than storing the object itself in case new metadata is
  // asynchronously loaded
  //
  _getComputedState(props, state) {
    const { metadata, tableFilter } = props;
    const {
      selectedDatabaseId,
      selectedSchemaId,
      selectedTableId,
      selectedFieldId,
    } = state;

    let { databases, schemas, tables, fields } = props;
    let selectedDatabase = null,
      selectedSchema = null,
      selectedTable = null,
      selectedField = null;

    const getDatabase = id =>
      _.findWhere(databases, { id }) || metadata.database(id);
    const getSchema = id => _.findWhere(schemas, { id }) || metadata.schema(id);
    const getTable = id => _.findWhere(tables, { id }) || metadata.table(id);
    const getField = id => _.findWhere(fields, { id }) || metadata.field(id);

    function setSelectedDatabase(database) {
      selectedDatabase = database;
      if (!schemas && database) {
        schemas = database.schemas;
      }
      if (!tables && Array.isArray(schemas) && schemas.length === 1) {
        tables = schemas[0].tables;
      }
    }
    function setSelectedSchema(schema) {
      selectedSchema = schema;
      if (!tables && schema) {
        tables = schema.tables;
      }
    }
    function setSelectedTable(table) {
      selectedTable = table;
      if (!fields && table) {
        fields = table.fields;
      }
    }
    function setSelectedField(field) {
      selectedField = field;
    }

    if (selectedDatabaseId != null) {
      setSelectedDatabase(getDatabase(selectedDatabaseId));
    }
    if (selectedSchemaId != null && selectedDatabaseId) {
      setSelectedSchema(getSchema(selectedSchemaId));
    }
    if (selectedTableId != null) {
      setSelectedTable(getTable(selectedTableId));
    }
    if (selectedFieldId != null) {
      setSelectedField(getField(selectedFieldId));
    }
    // now do it in in reverse to propagate it back up
    if (!selectedTable && selectedField) {
      setSelectedTable(selectedField.table);
    }
    if (!selectedSchema && selectedTable) {
      setSelectedSchema(selectedTable.schema);
    }
    if (!selectedDatabase && selectedSchema) {
      setSelectedDatabase(selectedSchema.database);
    }

    if (tables && tableFilter) {
      tables = tables.filter(tableFilter);
    }

    return {
      databases: databases || [],
      selectedDatabase: selectedDatabase,
      schemas: schemas || [],
      selectedSchema: selectedSchema,
      tables: tables || [],
      selectedTable: selectedTable,
      fields: fields || [],
      selectedField: selectedField,
    };
  }

  // Like setState, but automatically adds computed state so we don't have to recalculate
  // repeatedly. Also returns a promise resolves after state is updated
  setStateWithComputedState(newState, newProps = this.props) {
    return new Promise(resolve => {
      const computedState = this._getComputedState(newProps, {
        ...this.state,
        ...newState,
      });
      this.setState({ ...newState, ...computedState }, resolve);
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const newState = {};
    for (const propName of [
      "selectedDatabaseId",
      "selectedSchemaId",
      "selectedTableId",
      "selectedFieldId",
    ]) {
      if (
        nextProps[propName] !== this.props[propName] &&
        this.state[propName] !== nextProps[propName]
      ) {
        newState[propName] = nextProps[propName];
      }
    }
    if (Object.keys(newState).length > 0) {
      this.setStateWithComputedState(newState, nextProps);
    } else if (nextProps.metadata !== this.props.metadata) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount() {
    const { activeStep } = this.state;
    if (!this.isLoadingDatasets() && !activeStep) {
      await this.hydrateActiveStep();
    }

    if (this.props.selectedTableId) {
      await this.props.fetchFields(this.props.selectedTableId);
      if (this.isSavedQuestionSelected()) {
        this.showSavedQuestionPicker();
      }
    }
  }

  async componentDidUpdate(prevProps) {
    const { loading } = this.props;
    const loadedDatasets = prevProps.loading && !loading;

    // Once datasets are queried with the search endpoint,
    // this would hide the initial loading and view.
    // If there is at least one dataset, DATA_BUCKER_STEP will be shown,
    // otherwise, the picker will jump to the next step and present the regular picker
    if (loadedDatasets) {
      await this.hydrateActiveStep();
    }

    // this logic cleans up invalid states, e.x. if a selectedSchema's database
    // doesn't match selectedDatabase we clear it and go to the SCHEMA_STEP
    const {
      activeStep,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
    } = this.state;

    const invalidSchema =
      selectedDatabase &&
      selectedSchema &&
      selectedSchema.database.id !== selectedDatabase.id &&
      selectedSchema.database.id !== SAVED_QUESTIONS_VIRTUAL_DB_ID;

    const onStepMissingSchemaAndTable =
      !selectedSchema &&
      !selectedTable &&
      (activeStep === TABLE_STEP || activeStep === FIELD_STEP);

    const onStepMissingTable = !selectedTable && activeStep === FIELD_STEP;

    const invalidTable =
      selectedSchema &&
      selectedTable &&
      !isVirtualCardId(selectedTable.id) &&
      selectedTable.schema.id !== selectedSchema.id;

    const invalidField =
      selectedTable &&
      selectedField &&
      selectedField.table.id !== selectedTable.id;

    if (invalidSchema || onStepMissingSchemaAndTable) {
      await this.switchToStep(SCHEMA_STEP, {
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      });
    } else if (invalidTable || onStepMissingTable) {
      await this.switchToStep(TABLE_STEP, {
        selectedTableId: null,
        selectedFieldId: null,
      });
    } else if (invalidField) {
      await this.switchToStep(FIELD_STEP, { selectedFieldId: null });
    }
  }

  isLoadingDatasets = () => this.props.loading;

  hasDatasets = () => {
    const { search, loaded } = this.props;
    return loaded && search?.length > 0;
  };

  hasUsableDatasets = () => {
    // As datasets are actually saved questions, nested queries must be enabled
    return this.hasDatasets() && MetabaseSettings.get("enable-nested-queries");
  };

  getDatabases = () => {
    const { databases } = this.state;

    // When there is at least one dataset,
    // "Saved Questions" are presented in a different picker step
    // So it should be excluded from a regular databases list
    const shouldRemoveSavedQuestionDatabaseFromList =
      !MetabaseSettings.get("enable-nested-queries") || this.hasDatasets();

    return shouldRemoveSavedQuestionDatabaseFromList
      ? databases.filter(db => !db.is_saved_questions)
      : databases;
  };

  async hydrateActiveStep() {
    const { steps } = this.props;
    if (this.isSavedQuestionSelected()) {
      await this.switchToStep(DATABASE_STEP);
    } else if (this.state.selectedTableId && steps.includes(FIELD_STEP)) {
      await this.switchToStep(FIELD_STEP);
    } else if (this.state.selectedSchemaId && steps.includes(TABLE_STEP)) {
      await this.switchToStep(TABLE_STEP);
    } else if (this.state.selectedDatabaseId && steps.includes(SCHEMA_STEP)) {
      await this.switchToStep(SCHEMA_STEP);
    } else if (steps[0] === DATA_BUCKET_STEP && !this.hasUsableDatasets()) {
      await this.switchToStep(steps[1]);
    } else {
      await this.switchToStep(steps[0]);
    }
  }

  // for steps where there's a single option sometimes we want to automatically select it
  // if `useOnlyAvailable*` prop is provided
  skipSteps() {
    const { activeStep } = this.state;
    if (
      activeStep === DATABASE_STEP &&
      this.props.useOnlyAvailableDatabase &&
      this.props.selectedDatabaseId == null
    ) {
      const databases = this.getDatabases();
      if (databases && databases.length === 1) {
        this.onChangeDatabase(databases[0]);
      }
    }
    if (
      activeStep === SCHEMA_STEP &&
      this.props.useOnlyAvailableSchema &&
      this.props.selectedSchemaId == null
    ) {
      const { schemas } = this.state;
      if (schemas && schemas.length === 1) {
        this.onChangeSchema(schemas[0]);
      }
    }
  }

  getNextStep() {
    const { steps } = this.props;
    const index = steps.indexOf(this.state.activeStep);
    return index < steps.length - 1 ? steps[index + 1] : null;
  }

  getPreviousStep() {
    const { steps } = this.props;
    const { activeStep } = this.state;
    if (this.isLoadingDatasets() || activeStep === null) {
      return null;
    }

    let index = steps.indexOf(activeStep);
    if (index === -1) {
      console.error(`Step ${activeStep} not found in ${steps}.`);
      return null;
    }

    // move to previous step
    index -= 1;

    // possibly skip another step backwards
    if (
      steps[index] === SCHEMA_STEP &&
      this.props.useOnlyAvailableSchema &&
      this.state.schemas.length === 1
    ) {
      index -= 1;
    }

    // data bucket step doesn't make a lot of sense when there're no datasets
    if (steps[index] === DATA_BUCKET_STEP && !this.hasUsableDatasets()) {
      return null;
    }

    // can't go back to a previous step
    if (index < 0) {
      return null;
    }
    return steps[index];
  }

  nextStep = async (stateChange = {}, skipSteps = true) => {
    const nextStep = this.getNextStep();
    if (!nextStep) {
      await this.setStateWithComputedState(stateChange);
      this.popover.current && this.popover.current.toggle();
    } else {
      await this.switchToStep(nextStep, stateChange, skipSteps);
    }
  };

  previousStep = () => {
    const previousStep = this.getPreviousStep();
    if (previousStep) {
      const clearedState = this.getClearedStateForStep(previousStep);
      this.switchToStep(previousStep, clearedState, false);
    }
  };

  getClearedStateForStep(step) {
    if (step === DATA_BUCKET_STEP) {
      return {
        selectedDataBucketId: null,
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === DATABASE_STEP) {
      return {
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === SCHEMA_STEP) {
      return {
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === TABLE_STEP) {
      return {
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === FIELD_STEP) {
      return {
        selectedFieldId: null,
      };
    }
    return {};
  }

  async loadStepData(stepName) {
    const loadersForSteps = {
      // NOTE: make sure to return the action's resulting promise
      [DATABASE_STEP]: () => {
        return this.props.fetchDatabases(this.props.databaseQuery);
      },
      [SCHEMA_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchSchemas(this.state.selectedDatabaseId),
        ]);
      },
      [TABLE_STEP]: () => {
        if (this.state.selectedSchemaId != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchemaId);
        }
      },
      [FIELD_STEP]: () => {
        if (this.state.selectedTableId != null) {
          return this.props.fetchFields(this.state.selectedTableId);
        }
      },
    };

    if (loadersForSteps[stepName]) {
      try {
        await this.setStateWithComputedState({
          isLoading: true,
          isError: false,
        });
        await loadersForSteps[stepName]();
        await this.setStateWithComputedState({
          isLoading: false,
          isError: false,
        });
      } catch (e) {
        await this.setStateWithComputedState({
          isLoading: false,
          isError: true,
        });
      }
    }
  }

  hasPreloadedStepData(stepName) {
    const {
      hasLoadedDatabasesWithTables,
      hasLoadedDatabasesWithTablesSaved,
      hasLoadedDatabasesWithSaved,
    } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasLoadedDatabasesWithTablesSaved || hasLoadedDatabasesWithSaved;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      return (
        hasLoadedDatabasesWithTablesSaved ||
        (hasLoadedDatabasesWithTables &&
          !this.state.selectedDatabase.is_saved_questions)
      );
    } else if (stepName === FIELD_STEP) {
      return this.state.fields.length > 0;
    }
  }

  switchToStep = async (stepName, stateChange = {}, skipSteps = true) => {
    await this.setStateWithComputedState({
      ...stateChange,
      activeStep: stepName,
    });
    if (!this.hasPreloadedStepData(stepName)) {
      await this.loadStepData(stepName);
    }
    if (skipSteps) {
      await this.skipSteps();
    }
  };

  showSavedQuestionPicker = () =>
    this.setState({ isSavedQuestionPickerShown: true });

  onChangeDataBucket = selectedDataBucketId => {
    const { databases } = this.props;
    if (selectedDataBucketId === DATA_BUCKET.RAW_DATA) {
      this.switchToStep(DATABASE_STEP, { selectedDataBucketId });
      return;
    }
    this.switchToStep(
      DATABASE_STEP,
      {
        selectedDataBucketId,
      },
      false,
    );
    const database = databases.find(db => db.is_saved_questions);
    if (database) {
      this.onChangeDatabase(database);
    }
  };

  onChangeDatabase = async database => {
    if (database.is_saved_questions) {
      this.showSavedQuestionPicker();
      return;
    }

    if (this.props.setDatabaseFn) {
      this.props.setDatabaseFn(database && database.id);
    }

    if (this.state.selectedDatabaseId != null) {
      // If we already had a database selected, we need to go back and clear
      // data before advancing to the next step.
      await this.previousStep();
    }
    await this.nextStep({ selectedDatabaseId: database && database.id });
  };

  onChangeSchema = async schema => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema && schema.id });
  };

  onChangeTable = async table => {
    if (this.props.setSourceTableFn) {
      this.props.setSourceTableFn(table?.id);
    }
    await this.nextStep({ selectedTableId: table?.id });
  };

  onChangeField = async field => {
    if (this.props.setFieldFn) {
      this.props.setFieldFn(field?.id);
    }
    await this.nextStep({ selectedFieldId: field?.id });
  };

  getTriggerElement = triggerProps => {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      getTriggerElementContent,
      hasTriggerExpandControl,
    } = this.props;

    if (triggerElement) {
      return triggerElement;
    }

    const { selectedDatabase, selectedTable, selectedField } = this.state;

    return (
      <span
        className={className || "px2 py2 text-bold cursor-pointer text-default"}
        style={style}
      >
        {React.createElement(getTriggerElementContent, {
          selectedDatabase,
          selectedTable,
          selectedField,
          ...triggerProps,
        })}
        {!this.props.readOnly && hasTriggerExpandControl && (
          <Icon
            className="ml1"
            name="chevrondown"
            size={triggerIconSize || 8}
          />
        )}
      </span>
    );
  };

  getTriggerClasses() {
    if (this.props.triggerClasses) {
      return this.props.triggerClasses;
    }
    return this.props.renderAsSelect
      ? "border-medium bg-white block no-decoration"
      : "flex align-center";
  }

  handleSavedQuestionPickerClose = () => {
    const { selectedDataBucketId } = this.state;
    if (
      selectedDataBucketId === DATA_BUCKET.DATASETS ||
      this.hasUsableDatasets()
    ) {
      this.previousStep();
    }
    this.setState({ isSavedQuestionPickerShown: false });
  };

  renderActiveStep() {
    const { combineDatabaseSchemaSteps } = this.props;

    const props = {
      ...this.state,
      databases: this.getDatabases(),

      onChangeDataBucket: this.onChangeDataBucket,
      onChangeDatabase: this.onChangeDatabase,
      onChangeSchema: this.onChangeSchema,
      onChangeTable: this.onChangeTable,
      onChangeField: this.onChangeField,

      // misc
      requireWriteback: this.props.requireWriteback,
      isLoading: this.state.isLoading,
      hasNextStep: !!this.getNextStep(),
      onBack: this.getPreviousStep() ? this.previousStep : null,
      hasFiltering: true,
      hasInitialFocus: !this.showTableSearch(),
    };

    switch (this.state.activeStep) {
      case COLLECTION_DATASET_STEP:
        return (
          <CollectionDatasetPicker
            {...props}
            collectionId={this.props.collectionId}
            handleCollectionDatasetSelect={this.handleCollectionDatasetSelect}
            onSeeAllData={this.handleCollectionDatasetsPickerClose}
          />
        );
      case DATA_BUCKET_STEP:
        return <DataBucketPicker {...props} />;
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker
            {...props}
            hasBackButton={this.hasUsableDatasets() && props.onBack}
          />
        ) : (
          <DatabasePicker {...props} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker
            {...props}
            hasBackButton={this.hasUsableDatasets() && props.onBack}
          />
        ) : (
          <SchemaPicker {...props} />
        );
      case TABLE_STEP:
        return <TablePicker {...props} />;
      case FIELD_STEP:
        return <FieldPicker {...props} />;
    }

    return null;
  }

  isSavedQuestionSelected = () => isVirtualCardId(this.props.selectedTableId);

  handleSavedQuestionSelect = async table => {
    if (this.props.setSourceTableFn) {
      this.props.setSourceTableFn(table.id);
    }
    this.popover.current.toggle();
    this.handleClose();
  };

  showTableSearch = () => {
    const { hasTableSearch, steps } = this.props;
    const { activeStep } = this.state;
    const hasTableStep = steps.includes(TABLE_STEP);
    const isAllowedToShowOnActiveStep = [
      DATA_BUCKET_STEP,
      SCHEMA_STEP,
      DATABASE_STEP,
    ].includes(activeStep);

    return hasTableSearch && hasTableStep && isAllowedToShowOnActiveStep;
  };

  handleSearchTextChange = searchText =>
    this.setState({
      searchText,
    });

  handleCollectionDatasetSelect = async dataset => {
    const tableId = getQuestionVirtualTableId(dataset);
    await this.props.fetchFields(tableId);
    if (this.props.setSourceTableFn) {
      this.props.setSourceTableFn(tableId);
    }
    this.popover.current.toggle();
    this.props.onCloseCollectionDatasets();
    this.switchToStep(TABLE_STEP);
  };

  handleCollectionDatasetsPickerClose = () => {
    this.props.onCloseCollectionDatasets();
    this.switchToStep(
      this.hasUsableDatasets() ? DATA_BUCKET_STEP : DATABASE_STEP,
    );
  };

  handleSearchItemSelect = async item => {
    const table = convertSearchResultToTableLikeItem(item);
    await this.props.fetchFields(table.id);
    if (this.props.setSourceTableFn) {
      this.props.setSourceTableFn(table.id);
    }
    this.popover.current.toggle();
    this.handleClose();
  };

  handleClose = () => {
    const { onClose } = this.props;
    this.setState({ searchText: "" });
    if (typeof onProps === "function") {
      onClose();
    }
  };

  getSearchInputPlaceholder = () => {
    const { activeStep, selectedDataBucketId, isSavedQuestionPickerShown } =
      this.state;
    if (activeStep === DATA_BUCKET_STEP) {
      return t`Search for some data…`;
    }
    if (selectedDataBucketId === DATA_BUCKET.DATASETS) {
      return t`Search for a model…`;
    }
    return isSavedQuestionPickerShown
      ? t`Search for a question…`
      : t`Search for a table…`;
  };

  getSearchModels = () => {
    const { selectedDataBucketId, isSavedQuestionPickerShown } = this.state;
    if (!MetabaseSettings.get("enable-nested-queries")) {
      return ["table"];
    }
    if (!this.hasUsableDatasets()) {
      return isSavedQuestionPickerShown ? ["card"] : ["card", "table"];
    }
    if (!selectedDataBucketId) {
      return ["card", "dataset", "table"];
    }
    return {
      [DATA_BUCKET.DATASETS]: ["dataset"],
      [DATA_BUCKET.RAW_DATA]: ["table"],
      [DATA_BUCKET.SAVED_QUESTIONS]: ["card"],
    }[selectedDataBucketId];
  };

  hasDataAccess = () => {
    const { hasDataAccess, databases } = this.props;
    return hasDataAccess || databases?.length > 0;
  };

  render() {
    const {
      searchText,
      isSavedQuestionPickerShown,
      selectedDataBucketId,
      selectedTable,
    } = this.state;
    const { canChangeDatabase, selectedDatabaseId } = this.props;

    const currentDatabaseId = canChangeDatabase ? null : selectedDatabaseId;

    const isSearchActive = searchText.trim().length >= MIN_SEARCH_LENGTH;

    const isPickerOpen =
      isSavedQuestionPickerShown ||
      selectedDataBucketId === DATA_BUCKET.DATASETS;
    return (
      <PopoverWithTrigger
        id="DataPopover"
        autoWidth
        ref={this.popover}
        isInitiallyOpen={this.props.isInitiallyOpen}
        containerClassName={this.props.containerClassName}
        triggerElement={this.getTriggerElement}
        triggerClasses={this.getTriggerClasses()}
        hasArrow={this.props.hasArrow}
        tetherOptions={this.props.tetherOptions}
        sizeToFit
        isOpen={this.props.isOpen}
        onClose={this.handleClose}
      >
        {this.isLoadingDatasets() ? (
          <LoadingAndErrorWrapper loading />
        ) : this.hasDataAccess() ? (
          <>
            {this.showTableSearch() && (
              <ListSearchField
                hasClearButton
                className="bg-white m1"
                onChange={this.handleSearchTextChange}
                value={searchText}
                placeholder={this.getSearchInputPlaceholder()}
                autoFocus
              />
            )}
            {isSearchActive && (
              <SearchResults
                searchModels={this.getSearchModels()}
                searchQuery={searchText.trim()}
                databaseId={currentDatabaseId}
                onSelect={this.handleSearchItemSelect}
              />
            )}
            {!isSearchActive &&
              (isPickerOpen ? (
                <SavedQuestionPicker
                  collectionName={
                    selectedTable &&
                    selectedTable.schema &&
                    getSchemaName(selectedTable.schema.id)
                  }
                  isDatasets={selectedDataBucketId === DATA_BUCKET.DATASETS}
                  tableId={selectedTable?.id}
                  databaseId={currentDatabaseId}
                  onSelect={this.handleSavedQuestionSelect}
                  onBack={this.handleSavedQuestionPickerClose}
                />
              ) : (
                this.renderActiveStep()
              ))}
          </>
        ) : (
          <EmptyStateContainer>
            <EmptyState
              message={t`To pick some data, you'll need to add some first`}
              icon="database"
            />
          </EmptyStateContainer>
        )}
      </PopoverWithTrigger>
    );
  }
}

const CollectionDatasetPicker = ({
  collectionId,
  handleCollectionDatasetSelect,
  onSeeAllData,
}) => {
  return (
    <Search.ListLoader
      query={{
        collection: collectionId,
        models: ["dataset"],
      }}
      loadingAndErrorWrapper={false}
    >
      {({ list: datasets }) => (
        <CollectionDatasetList
          datasets={datasets}
          onSelect={handleCollectionDatasetSelect}
          onSeeAllData={onSeeAllData}
        />
      )}
    </Search.ListLoader>
  );
};

function CollectionDatasetList({ datasets, onSelect, onSeeAllData }) {
  useEffect(() => {
    if (datasets?.length === 0) {
      onSeeAllData();
    } else if (datasets?.length === 1) {
      onSelect(datasets[0]);
    }
  }, [datasets, onSelect, onSeeAllData]);

  // If there are no datasets, in a collection, we just switch to the normal picker
  // If there is exactly one dataset, we select it and close the picker
  // The loading indicator is still shown for both cases to prevent flickering
  // Example: spinner > one dataset shown > it gets selected > the selector closes, everything flickers
  if (!datasets || datasets.length === 0 || datasets.length === 1) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <CollectionDatasetSelectList>
      {datasets.map(dataset => {
        return (
          <CollectionDatasetSelectList.Item
            key={dataset.id}
            name={dataset.name}
            onSelect={() => onSelect(dataset)}
            size="small"
            icon={{ name: "model", size: 16 }}
            rightIcon={PLUGIN_MODERATION.getStatusIcon(
              dataset.moderated_status,
            )}
          />
        );
      })}
      <CollectionDatasetAllDataLink
        key="all-data"
        onSelect={onSeeAllData}
        as={props => <li {...props} />}
      >
        <CollectionDatasetAllDataLink.Content>
          {t`All data`}
          <Icon key="icon" name="chevronright" size={12} />
        </CollectionDatasetAllDataLink.Content>
      </CollectionDatasetAllDataLink>
    </CollectionDatasetSelectList>
  );
}

const DataBucketPicker = ({ onChangeDataBucket }) => {
  const BUCKETS = [
    {
      id: DATA_BUCKET.DATASETS,
      icon: "model",
      name: t`Models`,
      description: t`The best starting place for new questions.`,
    },
    {
      id: DATA_BUCKET.RAW_DATA,
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    },
    {
      id: DATA_BUCKET.SAVED_QUESTIONS,
      name: t`Saved Questions`,
      icon: "folder",
      description: t`Use any question’s results to start a new question.`,
    },
  ];

  return (
    <DataBucketList>
      {BUCKETS.map(bucket => (
        <DataBucketListItem
          {...bucket}
          key={bucket.id}
          onSelect={onChangeDataBucket}
        />
      ))}
    </DataBucketList>
  );
};

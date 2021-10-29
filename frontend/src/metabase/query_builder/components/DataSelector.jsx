/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";

import ListSearchField from "metabase/components/ListSearchField";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import AccordionList from "metabase/components/AccordionList";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import MetabaseSettings from "metabase/lib/settings";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import Search from "metabase/entities/search";
import {
  SearchResults,
  convertSearchResultToTableLikeItem,
  isSavedQuestion,
} from "./data-search";
import SavedQuestionPicker from "./saved-question-picker/SavedQuestionPicker";

import { getMetadata } from "metabase/selectors/metadata";
import { getSchemaName } from "metabase/schema";

import {
  DataBucketIcon,
  DataBucketDescription,
  RawDataBackButton,
} from "./DataSelector.styled";
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

export const DatabaseDataSelector = props => (
  <DataSelector
    steps={[DATABASE_STEP]}
    getTriggerElementContent={DatabaseTriggerContent}
    {...props}
  />
);

export const DatabaseSchemaAndTableDataSelector = props => (
  <DataSelector
    steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
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

@Search.loadList({
  // If there is at least one dataset,
  // we want to display a slightly different data picker view
  // (see DATA_BUCKET step)
  query: {
    models: "dataset",
    limit: 1,
  },
  loadingAndErrorWrapper: false,
})
@connect(
  (state, ownProps) => ({
    metadata: getMetadata(state),
    databases:
      ownProps.databases ||
      Databases.selectors.getList(state, {
        entityQuery: ownProps.databaseQuery,
      }) ||
      [],
    hasFetchedDatabasesWithTablesSaved: !!Databases.selectors.getList(state, {
      entityQuery: { include: "tables", saved: true },
    }),
    hasFetchedDatabasesWithSaved: !!Databases.selectors.getList(state, {
      entityQuery: { saved: true },
    }),
    hasFetchedDatabasesWithTables: !!Databases.selectors.getList(state, {
      entityQuery: { include: "tables" },
    }),
  }),
  {
    fetchDatabases: databaseQuery => Databases.actions.fetchList(databaseQuery),
    fetchSchemas: databaseId => Schemas.actions.fetchList({ dbId: databaseId }),
    fetchSchemaTables: schemaId => Schemas.actions.fetch({ id: schemaId }),
    fetchFields: tableId => Tables.actions.fetchMetadata({ id: tableId }),
  },
)
class DataSelector extends Component {
  render() {
    return <UnconnectedDataSelector {...this.props} />;
  }
}

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
    if (this.props.selectedTableId) {
      await this.props.fetchFields(this.props.selectedTableId);
      if (this.isSavedQuestionSelected()) {
        this.showSavedQuestionPicker();
      }
    }
  }

  async componentDidUpdate(prevProps) {
    const { steps, loading } = this.props;
    const loadedDatasets = prevProps.loading && !loading;

    // Once datasets are queried with the search endpoint,
    // this would hide the initial loading and view.
    // If there is at least one dataset, DATA_BUCKER_STEP will be shown,
    // otherwise, the picker will jump to the next step and present the regular picker
    if (loadedDatasets) {
      const [firstStep] = steps;
      if (firstStep === DATA_BUCKET_STEP && !this.hasDatasets()) {
        this.switchToStep(steps[1]);
      } else {
        this.hydrateActiveStep();
      }
    }

    // this logic cleans up invalid states, e.x. if a selectedSchema's database
    // doesn't match selectedDatabase we clear it and go to the SCHEMA_STEP
    const {
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

    const invalidTable =
      selectedSchema &&
      selectedTable &&
      !isSavedQuestion(selectedTable.id) &&
      selectedTable.schema.id !== selectedSchema.id;
    const invalidField =
      selectedTable &&
      selectedField &&
      selectedField.table.id !== selectedTable.id;

    if (invalidSchema) {
      await this.switchToStep(SCHEMA_STEP, {
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      });
    } else if (invalidTable) {
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
      const { databases } = this.state;
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
    let index = steps.indexOf(this.state.activeStep);
    if (index === -1) {
      console.error(`Step ${this.state.activeStep} not found in ${steps}.`);
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
    if (steps[index] === DATA_BUCKET_STEP && !this.hasDatasets()) {
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
        return this.props.fetchSchemas(this.state.selectedDatabaseId);
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
      hasFetchedDatabasesWithTables,
      hasFetchedDatabasesWithTablesSaved,
      hasFetchedDatabasesWithSaved,
    } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasFetchedDatabasesWithTablesSaved || hasFetchedDatabasesWithSaved;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      return (
        hasFetchedDatabasesWithTablesSaved ||
        (hasFetchedDatabasesWithTables &&
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
    this.switchToStep(DATABASE_STEP, { selectedDataBucketId });
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
      this.props.setSourceTableFn(table && table.id);
    }
    await this.nextStep({ selectedTableId: table && table.id });
  };

  onChangeField = async field => {
    if (this.props.setFieldFn) {
      this.props.setFieldFn(field && field.id);
    }
    await this.nextStep({ selectedFieldId: field && field.id });
  };

  getTriggerElement() {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      getTriggerElementContent,
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
        })}
        {!this.props.readOnly && (
          <Icon
            className="ml1"
            name="chevrondown"
            size={triggerIconSize || 8}
          />
        )}
      </span>
    );
  }

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
    if (selectedDataBucketId === DATA_BUCKET.DATASETS || this.hasDatasets()) {
      this.previousStep();
    }
    this.setState({ isSavedQuestionPickerShown: false });
  };

  renderActiveStep() {
    const { combineDatabaseSchemaSteps } = this.props;
    const { databases } = this.state;

    const showSavedQuestionsInDatabasePicker = !this.hasDatasets();
    const filteredDatabases = showSavedQuestionsInDatabasePicker
      ? databases
      : databases?.filter(db => !db.is_saved_questions);

    const props = {
      ...this.state,
      databases: filteredDatabases,

      onChangeDataBucket: this.onChangeDataBucket,
      onChangeDatabase: this.onChangeDatabase,
      onChangeSchema: this.onChangeSchema,
      onChangeTable: this.onChangeTable,
      onChangeField: this.onChangeField,

      // misc
      isLoading: this.state.isLoading,
      hasNextStep: !!this.getNextStep(),
      onBack: this.getPreviousStep() ? this.previousStep : null,
      hasFiltering: true,
    };

    switch (this.state.activeStep) {
      case DATA_BUCKET_STEP:
        return <DataBucketPicker {...props} />;
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} />
        ) : (
          <DatabasePicker {...props} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} />
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

  isSavedQuestionSelected = () => isSavedQuestion(this.props.selectedTableId);

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
    this.setState({ searchText: "" });
  };

  getSearchInputPlaceholder = () => {
    const {
      activeStep,
      selectedDataBucketId,
      isSavedQuestionPickerShown,
    } = this.state;
    if (activeStep === DATA_BUCKET_STEP) {
      return t`Search for some data...`;
    }
    if (selectedDataBucketId === DATA_BUCKET.DATASETS) {
      return t`Search for a model...`;
    }
    return isSavedQuestionPickerShown
      ? t`Search for a question...`
      : t`Search for a table...`;
  };

  getSearchModels = () => {
    const { selectedDataBucketId, isSavedQuestionPickerShown } = this.state;
    if (!selectedDataBucketId) {
      return ["card", "dataset", "table"];
    }
    if (selectedDataBucketId === DATA_BUCKET.DATASETS) {
      return ["dataset"];
    }
    if (isSavedQuestionPickerShown) {
      return ["card"];
    }
    return this.hasDatasets() ? ["table", "card"] : ["table"];
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
        triggerElement={this.getTriggerElement()}
        triggerClasses={this.getTriggerClasses()}
        horizontalAttachments={["center", "left", "right"]}
        hasArrow={this.props.hasArrow}
        tetherOptions={this.props.tetherOptions}
        sizeToFit
        isOpen={this.props.isOpen}
        onClose={this.handleClose}
      >
        {this.isLoadingDatasets() ? (
          <LoadingAndErrorWrapper loading />
        ) : (
          <React.Fragment>
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
                  tableId={selectedTable && selectedTable.id}
                  databaseId={currentDatabaseId}
                  onSelect={this.handleSavedQuestionSelect}
                  onBack={this.handleSavedQuestionPickerClose}
                />
              ) : (
                this.renderActiveStep()
              ))}
          </React.Fragment>
        )}
      </PopoverWithTrigger>
    );
  }
}

const DataBucketPicker = ({ selectedDataBucketId, onChangeDataBucket }) => {
  const sections = [
    {
      items: [
        {
          id: DATA_BUCKET.DATASETS,
          index: 0,
          icon: "dataset",
          name: t`Datasets`,
          description: t`The best starting place for new questions.`,
        },
        {
          id: DATA_BUCKET.RAW_DATA,
          index: 1,
          icon: "database",
          name: t`Raw Data`,
          description: t`Unaltered tables in connected databases.`,
        },
        {
          id: DATA_BUCKET.SAVED_QUESTIONS,
          index: 2,
          name: t`Saved Questions`,
          icon: "folder",
          description: t`Use any question’s results to start a new question.`,
        },
      ],
    },
  ];

  return (
    <AccordionList
      id="DataBucketPicker"
      className="text-brand"
      sections={sections}
      onChange={item => onChangeDataBucket(item.id)}
      itemIsSelected={item => item.id === selectedDataBucketId}
      renderItemIcon={item => <DataBucketIcon name={item.icon} size={18} />}
      getItemIconPosition={() => "near-name"}
      renderItemDescription={item => (
        <DataBucketDescription>{item.description}</DataBucketDescription>
      )}
    />
  );
};

const DatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasNextStep,
  onBack,
}) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections = [
    {
      name: onBack ? <RawDataBackButton onBack={onBack} /> : null,
      items: databases.map((database, index) => ({
        name: database.name,
        index,
        database: database,
      })),
    },
  ];

  return (
    <AccordionList
      id="DatabasePicker"
      key="databasePicker"
      className="text-brand"
      sections={sections}
      onChange={item => onChangeDatabase(item.database)}
      itemIsSelected={item =>
        selectedDatabase && item.database.id === selectedDatabase.id
      }
      renderItemIcon={() => (
        <Icon className="Icon text-default" name="database" size={18} />
      )}
      showItemArrows={hasNextStep}
    />
  );
};

const SchemaPicker = ({
  schemas,
  selectedSchemaId,
  onChangeSchema,
  hasNextStep,
  hasFiltering,
}) => {
  const sections = [
    {
      items: schemas.map(schema => ({
        name: schema.displayName(),
        schema: schema,
      })),
    },
  ];
  return (
    <div style={{ width: 300 }}>
      <AccordionList
        id="SchemaPicker"
        key="schemaPicker"
        className="text-brand"
        sections={sections}
        searchable={hasFiltering}
        onChange={item => onChangeSchema(item.schema)}
        itemIsSelected={item => item && item.schema.id === selectedSchemaId}
        renderItemIcon={() => <Icon name="folder" size={16} />}
        showItemArrows={hasNextStep}
      />
    </div>
  );
};

const DatabaseSchemaPicker = ({
  databases,
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  onChangeDatabase,
  hasNextStep,
  isLoading,
  onBack,
}) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const hasPreviousStep = typeof onBack === "function";

  const sections = databases.map(database => ({
    name: database.is_saved_questions ? t`Saved Questions` : database.name,
    items:
      !database.is_saved_questions && database.schemas.length > 1
        ? database.schemas.map(schema => ({
            schema,
            name: schema.displayName(),
          }))
        : [],
    className: database.is_saved_questions ? "bg-light" : null,
    icon: database.is_saved_questions ? "all" : "database",
    loading:
      selectedDatabase &&
      selectedDatabase.id === database.id &&
      database.schemas.length === 0 &&
      isLoading,
  }));

  if (hasPreviousStep) {
    sections.unshift({
      name: <RawDataBackButton onBack={onBack} />,
    });
  }

  let openSection = selectedSchema
    ? databases.findIndex(db => db.id === selectedSchema.database.id)
    : selectedDatabase
    ? databases.findIndex(db => db.id === selectedDatabase.id)
    : -1;

  if (
    openSection >= 0 &&
    databases[openSection] &&
    databases[openSection].schemas.length === 1
  ) {
    openSection = -1;
  }

  return (
    <AccordionList
      id="DatabaseSchemaPicker"
      key="databaseSchemaPicker"
      className="text-brand"
      sections={sections}
      onChange={item => onChangeSchema(item.schema)}
      onChangeSection={(_section, sectionIndex) => {
        const isNavigationSection = hasPreviousStep && sectionIndex === 0;
        if (isNavigationSection) {
          return false;
        }
        // the "go back" button is also a section,
        // so need to take its index in mind
        const database = hasPreviousStep
          ? databases[sectionIndex - 1]
          : databases[sectionIndex];
        onChangeDatabase(database);
        return true;
      }}
      itemIsSelected={schema => schema === selectedSchema}
      renderSectionIcon={item =>
        item.icon && (
          <Icon className="Icon text-default" name={item.icon} size={18} />
        )
      }
      renderItemIcon={() => <Icon name="folder" size={16} />}
      initiallyOpenSection={openSection}
      alwaysTogglable={true}
      showItemArrows={hasNextStep}
    />
  );
};

const TablePicker = ({
  schemas,
  tables,
  selectedDatabase,
  selectedSchema,
  selectedTable,
  onChangeTable,
  hasNextStep,
  onBack,
  isLoading,
  hasFiltering,
  minTablesToShowSearch = 10,
}) => {
  // In case DataSelector props get reseted
  if (!selectedDatabase) {
    if (onBack) {
      onBack();
    }
    return null;
  }

  const isSavedQuestionList = selectedDatabase.is_saved_questions;
  const header = (
    <div className="flex flex-wrap align-center">
      <span
        className={cx("flex align-center", {
          "text-brand-hover cursor-pointer": onBack,
        })}
        onClick={onBack}
      >
        {onBack && <Icon name="chevronleft" size={18} />}
        <span className="ml1 text-wrap">{selectedDatabase.name}</span>
      </span>
      {selectedSchema && selectedSchema.name && schemas.length > 1 && (
        <span className="ml1 text-wrap text-slate">
          - {selectedSchema.displayName()}
        </span>
      )}
    </div>
  );

  if (tables.length > 0 || isLoading) {
    const sections = [
      {
        name: header,
        items: tables.map(table => ({
          name: table.displayName(),
          table: table,
          database: selectedDatabase,
        })),
        loading: tables.length === 0 && isLoading,
      },
    ];
    return (
      <div
        style={{ width: 300, overflowY: "auto" }}
        data-testid="data-selector"
      >
        <AccordionList
          id="TablePicker"
          key="tablePicker"
          className="text-brand"
          sections={sections}
          maxHeight={Infinity}
          width={"100%"}
          searchable={hasFiltering && tables.length >= minTablesToShowSearch}
          onChange={item => onChangeTable(item.table)}
          itemIsSelected={item =>
            item.table && selectedTable
              ? item.table.id === selectedTable.id
              : false
          }
          itemIsClickable={item => item.table}
          renderItemIcon={item =>
            item.table ? <Icon name="table2" size={18} /> : null
          }
          showItemArrows={hasNextStep}
        />
        {isSavedQuestionList && (
          <div className="bg-light p2 text-centered border-top">
            {t`Is a question missing?`}
            <ExternalLink
              href={MetabaseSettings.docsUrl(
                "users-guide/custom-questions",
                "picking-your-starting-data",
              )}
              target="_blank"
              className="block link"
            >
              {t`Learn more about nested queries`}
            </ExternalLink>
          </div>
        )}
      </div>
    );
  } else {
    // this is a database with no tables!
    return (
      <section
        className="List-section List-section--open"
        style={{ width: 300 }}
      >
        <div className="p1 border-bottom">
          <div className="px1 py1 flex align-center">
            <h3 className="text-default">{header}</h3>
          </div>
        </div>
        <div className="p4 text-centered">{t`No tables found in this database.`}</div>
      </section>
    );
  }
};

class FieldPicker extends Component {
  render() {
    const {
      isLoading,
      fields,
      selectedTable,
      selectedField,
      onChangeField,
      onBack,
      hasFiltering,
    } = this.props;

    const header = (
      <span className="flex align-center">
        <span
          className="flex align-center text-slate cursor-pointer"
          onClick={onBack}
        >
          <Icon name="chevronleft" size={18} />
          <span className="ml1 text-wrap">
            {(selectedTable && selectedTable.display_name) || t`Fields`}
          </span>
        </span>
      </span>
    );

    if (isLoading) {
      return <DataSelectorLoading header={header} />;
    }

    const sections = [
      {
        name: header,
        items: fields.map(field => ({
          name: field.display_name,
          field: field,
        })),
      },
    ];

    return (
      <div style={{ width: 300, overflowY: "auto" }}>
        <AccordionList
          id="FieldPicker"
          key="fieldPicker"
          className="text-brand"
          sections={sections}
          maxHeight={Infinity}
          width={"100%"}
          searchable={hasFiltering}
          onChange={item => onChangeField(item.field)}
          itemIsSelected={item =>
            item.field && selectedField
              ? item.field.id === selectedField.id
              : false
          }
          itemIsClickable={item => item.field}
          renderItemIcon={item =>
            item.field ? (
              <Icon name={item.field.dimension().icon()} size={18} />
            ) : null
          }
        />
      </div>
    );
  }
}

const DataSelectorLoading = ({ header }) => {
  if (header) {
    return (
      <section
        className="List-section List-section--open"
        style={{ width: 300 }}
      >
        <div className="p1 border-bottom">
          <div className="px1 py1 flex align-center">
            <h3 className="text-default">{header}</h3>
          </div>
        </div>
        <LoadingAndErrorWrapper loading />;
      </section>
    );
  } else {
    return <LoadingAndErrorWrapper loading />;
  }
};

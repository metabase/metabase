import cx from "classnames";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { Component, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  cardApi,
  databaseApi,
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useListDatabasesQuery,
  useSearchQuery,
} from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { canUserCreateQueries } from "metabase/current-user";
import type { DataSourceSelectorProps } from "metabase/embedding-sdk/types/components/data-picker";
import { getMetadata } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getSetting } from "metabase/settings";
import { Box, Popover } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import { parseSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CardType,
  CollectionId,
  DatabaseId,
  ListDatabasesRequest,
  SchemaId,
  SearchModel,
  SearchResponse,
  TableId,
} from "metabase-types/api";

import { DataSelectorDataBucketPicker as DataBucketPicker } from "../DataSelectorDataBucketPicker";
import { DataSelectorDatabasePicker as DatabasePicker } from "../DataSelectorDatabasePicker";
import { DataSelectorDatabaseSchemaPicker as DatabaseSchemaPicker } from "../DataSelectorDatabaseSchemaPicker";
import { DataSelectorSchemaPicker as SchemaPicker } from "../DataSelectorSchemaPicker";
import { DataSelectorTablePicker as TablePicker } from "../DataSelectorTablePicker";
import {
  TableTrigger,
  Trigger,
  type TriggerComponentProps,
} from "../TriggerComponents";
import { CONTAINER_WIDTH, DATA_BUCKET } from "../constants";
import { SavedEntityPicker } from "../saved-entity-picker/SavedEntityPicker";
import type { DataPickerDataType, SavedEntityType } from "../types";
import { getDataTypes } from "../utils";

// chooses a data source bucket (datasets / raw data (tables) / saved questions)
const DATA_BUCKET_STEP = "BUCKET";
// chooses a database or a model
const DATABASE_STEP = "DATABASE";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";

type DataSelectorStep =
  | typeof DATA_BUCKET_STEP
  | typeof DATABASE_STEP
  | typeof SCHEMA_STEP
  | typeof TABLE_STEP;

// The trimmed search response withAvailableModels hands to connect; only its
// `available_models` field is read, but it carries the rest of the payload.
type AvailableModelsResult = Omit<SearchResponse, "data">;

interface DataSelectorOwnProps {
  steps: DataSelectorStep[];
  combineDatabaseSchemaSteps?: boolean;
  triggerContentComponent: ComponentType<TriggerComponentProps>;
  triggerElement?: ReactNode;
  triggerIconSize?: number;
  triggerClasses?: string;
  containerClassName?: string;
  className?: string;
  style?: CSSProperties;
  isMantine?: boolean;
  isPopover?: boolean;
  isInitiallyOpen?: boolean;
  isOpen?: boolean;
  readOnly?: boolean;
  onClose?: () => void;
  hasTriggerExpandControl?: boolean;
  hideSingleSchema?: boolean;
  hideSingleDatabase?: boolean;
  popoverAriaLabel?: string;

  querySourceType?: DataSourceSelectorProps["querySourceType"];
  canChangeDatabase?: boolean;
  canSelectModel: boolean;
  canSelectTable: boolean;
  canSelectQuestion: boolean;

  selectedDataBucketId?: DataPickerDataType | null;
  selectedDatabaseId?: DatabaseId | null;
  selectedSchemaId?: SchemaId | null;
  selectedTableId?: TableId | null;
  selectedCollectionId?: CollectionId | null;

  databases?: Database[];
  schemas?: Schema[];
  tables?: Table[];

  setDatabaseFn?: (databaseId: DatabaseId) => void;
  setSourceTableFn?: (tableId: TableId, databaseId?: DatabaseId) => void;
  tableFilter?: (table: Table) => boolean;
}

interface DataSelectorStateProps {
  availableModels: SearchModel[];
  metadata: Metadata;
  databases: Database[];
  hasLoadedDatabasesWithTablesSaved: boolean;
  hasLoadedDatabasesWithSaved: boolean;
  hasLoadedDatabasesWithTables: boolean;
  hasDataAccess: boolean;
  hasNestedQueriesEnabled: boolean;
  selectedQuestion: Question | null;
}

interface DataSelectorDispatchProps {
  fetchDatabases: () => Promise<unknown>;
  fetchFields: (tableId: TableId) => Promise<unknown>;
  fetchQuestion: (id: TableId) => Promise<unknown>;
}

interface SchemaFetchersProps {
  fetchSchemas: (databaseId: DatabaseId) => Promise<unknown>;
  fetchSchemaTables: (schemaId: SchemaId) => Promise<unknown>;
}

interface AvailableModelsInjectedProps {
  loading: boolean;
  loaded: boolean;
  allLoading: boolean;
}

type DataSelectorProps = DataSelectorOwnProps &
  DataSelectorStateProps &
  DataSelectorDispatchProps &
  SchemaFetchersProps &
  AvailableModelsInjectedProps;

interface ComputedDataSelectorState {
  databases: Database[];
  selectedDatabase: Database | null;
  schemas: Schema[];
  selectedSchema: Schema | null;
  tables: Table[];
  selectedTable: Table | null;
}

interface DataSelectorState extends ComputedDataSelectorState {
  activeStep: DataSelectorStep | null;
  isLoading: boolean;
  isError: boolean;
  isPopoverOpen: boolean;
  isSavedEntityPickerShown: boolean;
  savedEntityType: CardType | null | undefined;
  selectedDataBucketId: DataPickerDataType | null | undefined;
  selectedDatabaseId: DatabaseId | null | undefined;
  selectedSchemaId: SchemaId | null | undefined;
  selectedTableId: TableId | null | undefined;
}

type SelectedIdsState = Pick<
  DataSelectorState,
  "selectedDatabaseId" | "selectedSchemaId" | "selectedTableId"
>;

export function DataSourceSelector(props: DataSourceSelectorProps) {
  return (
    <DataSelector
      steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      combineDatabaseSchemaSteps
      triggerContentComponent={TableTrigger}
      {...props}
    />
  );
}

export class UnconnectedDataSelector extends Component<
  DataSelectorProps,
  DataSelectorState
> {
  constructor(props: DataSelectorProps) {
    super(props);

    const state = {
      selectedDataBucketId: props.selectedDataBucketId,
      selectedDatabaseId: props.selectedDatabaseId,
      selectedSchemaId: props.selectedSchemaId,
      selectedTableId: props.selectedTableId,
      isSavedEntityPickerShown: false,
      savedEntityType: null,
      isPopoverOpen: Boolean(props.isInitiallyOpen && !props.readOnly),
    };
    const computedState = this._getComputedState(props, state);
    this.state = {
      activeStep: null,
      isLoading: false,
      isError: false,
      ...state,
      ...computedState,
    };
  }

  static defaultProps = {
    isInitiallyOpen: false,
    hideSingleSchema: true,
    hideSingleDatabase: false,
    canChangeDatabase: true,
    hasTriggerExpandControl: true,
    isPopover: true,
    isMantine: false,
  };

  isPopoverOpen(): boolean {
    // If the isOpen prop is passed in, use the controlled value.
    if (typeof this.props.isOpen === "boolean") {
      return this.props.isOpen;
    }

    // Otherwise, use the internal popover state.
    return this.state.isPopoverOpen;
  }

  // computes selected metadata objects (`selectedDatabase`, etc) and options (`databases`, etc)
  // from props (`metadata`, `databases`, etc) and state (`selectedDatabaseId`, etc)
  //
  // NOTE: this is complicated because we allow you to:
  // 1. pass in databases/schemas/tables as props
  // 2. pull them from the currently selected "parent" metadata object
  // 3. pull them out of metadata
  //
  // We also want to recompute the selected objects from their selected ID
  // each time rather than storing the object itself in case new metadata is
  // asynchronously loaded
  //
  _getComputedState(
    props: DataSelectorProps,
    state: SelectedIdsState,
  ): ComputedDataSelectorState {
    const { metadata, tableFilter } = props;
    const { selectedDatabaseId, selectedSchemaId, selectedTableId } = state;

    let { databases, schemas, tables } = props;
    let selectedDatabase: Database | null = null,
      selectedSchema: Schema | null = null,
      selectedTable: Table | null = null;

    const getDatabase = (id: DatabaseId) =>
      _.findWhere(databases ?? [], { id }) || metadata.database(id);
    const getSchema = (id: SchemaId) =>
      _.findWhere(schemas ?? [], { id }) || metadata.schema(id);
    const getTable = (id: TableId) =>
      _.findWhere(tables ?? [], { id }) || metadata.table(id);

    const deriveFromDatabase = (database: Database | null) => {
      if (!schemas && database) {
        schemas = database.schemas;
      }
      if (!tables && Array.isArray(schemas) && schemas.length === 1) {
        tables = schemas[0].tables;
      }
    };

    const deriveFromSchema = (schema: Schema | null) => {
      if (!tables && schema) {
        tables = schema.tables;
      }
    };

    if (selectedDatabaseId != null) {
      selectedDatabase = getDatabase(selectedDatabaseId) ?? null;
      deriveFromDatabase(selectedDatabase);
    }
    if (selectedSchemaId != null && selectedDatabaseId) {
      selectedSchema = getSchema(selectedSchemaId) ?? null;
      deriveFromSchema(selectedSchema);
    }
    if (selectedTableId != null) {
      selectedTable = getTable(selectedTableId) ?? null;
    }
    // now do it in in reverse to propagate it back up
    if (!selectedSchema && selectedTable) {
      selectedSchema = selectedTable.schema ?? null;
      deriveFromSchema(selectedSchema);
    }
    if (!selectedDatabase && selectedSchema) {
      selectedDatabase = selectedSchema.database ?? null;
      deriveFromDatabase(selectedDatabase);
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
    };
  }

  // Like setState, but automatically adds computed state so we don't have to recalculate
  // repeatedly. Also returns a promise resolves after state is updated
  setStateWithComputedState(
    newState: Partial<DataSelectorState>,
    newProps: DataSelectorProps = this.props,
  ): Promise<void> {
    return new Promise((resolve) => {
      const computedState = this._getComputedState(newProps, {
        ...this.state,
        ...newState,
      });
      this.setState(
        (prevState) => ({ ...prevState, ...newState, ...computedState }),
        resolve,
      );
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps: DataSelectorProps): void {
    const newState: Partial<DataSelectorState> = {};
    if (
      nextProps.selectedDatabaseId !== this.props.selectedDatabaseId &&
      this.state.selectedDatabaseId !== nextProps.selectedDatabaseId
    ) {
      newState.selectedDatabaseId = nextProps.selectedDatabaseId;
    }
    if (
      nextProps.selectedSchemaId !== this.props.selectedSchemaId &&
      this.state.selectedSchemaId !== nextProps.selectedSchemaId
    ) {
      newState.selectedSchemaId = nextProps.selectedSchemaId;
    }
    if (
      nextProps.selectedTableId !== this.props.selectedTableId &&
      this.state.selectedTableId !== nextProps.selectedTableId
    ) {
      newState.selectedTableId = nextProps.selectedTableId;
    }
    if (Object.keys(newState).length > 0) {
      this.setStateWithComputedState(newState, nextProps);
    } else if (nextProps.metadata !== this.props.metadata) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount(): Promise<void> {
    const { activeStep } = this.state;
    const {
      fetchFields,
      fetchQuestion,
      selectedTableId: sourceId,
    } = this.props;

    if (!this.isSearchLoading() && !activeStep) {
      await this.hydrateActiveStep();
    }

    if (sourceId) {
      await fetchFields(sourceId);
      if (this.isSavedEntitySelected()) {
        await fetchQuestion(sourceId);

        this.showSavedEntityPicker({
          entityType: this.props.selectedQuestion?.type(),
        });
      }
    }
  }

  async componentDidUpdate(prevProps: DataSelectorProps): Promise<void> {
    const { allLoading } = this.props;
    const loadedDatasets = prevProps.allLoading && !allLoading;

    // Once datasets are queried with the search endpoint,
    // this would hide the initial loading and view.
    // If there is at least one dataset, DATA_BUCKER_STEP will be shown,
    // otherwise, the picker will jump to the next step and present the regular picker
    if (loadedDatasets) {
      await this.hydrateActiveStep();
    }

    // this logic cleans up invalid states, e.x. if a selectedSchema's database
    // doesn't match selectedDatabase we clear it and go to the SCHEMA_STEP
    const { activeStep, selectedDatabase, selectedSchema, selectedTable } =
      this.state;

    const invalidSchema =
      selectedDatabase &&
      selectedSchema &&
      selectedSchema.database &&
      selectedSchema.database.id !== selectedDatabase.id &&
      selectedSchema.database.id !== SAVED_QUESTIONS_VIRTUAL_DB_ID;

    const onStepMissingSchemaAndTable =
      !selectedSchema && !selectedTable && activeStep === TABLE_STEP;

    // A table whose schema hasn't loaded counts as invalid and gets cleared.
    const invalidTable =
      selectedSchema &&
      selectedTable &&
      !isVirtualCardId(selectedTable.id) &&
      selectedTable.schema?.id !== selectedSchema.id;

    if (invalidSchema || onStepMissingSchemaAndTable) {
      await this.switchToStep(SCHEMA_STEP, {
        selectedSchemaId: null,
        selectedTableId: null,
      });
    } else if (invalidTable) {
      await this.switchToStep(TABLE_STEP, {
        selectedTableId: null,
      });
    }
  }

  isSearchLoading = (): boolean => {
    return this.props.loading;
  };

  getCardType(): SavedEntityType {
    const { selectedDataBucketId, savedEntityType } = this.state;
    if (
      selectedDataBucketId === DATA_BUCKET.MODELS ||
      savedEntityType === "model"
    ) {
      return "model";
    } else {
      return "question";
    }
  }

  hasModels = (): boolean => {
    const { availableModels, canSelectModel, loaded } = this.props;
    return loaded && canSelectModel && availableModels.includes("dataset");
  };

  hasUsableModels = (): boolean => {
    // As models are actually saved questions, nested queries must be enabled
    return this.hasModels() && this.props.hasNestedQueriesEnabled;
  };

  hasSavedQuestions = (): boolean => {
    const { canSelectQuestion } = this.props;
    return (
      this.state.databases.some((database) => database.is_saved_questions) &&
      canSelectQuestion
    );
  };

  isJoinStep(): boolean {
    return !this.props.canChangeDatabase;
  }

  getDatabases = (): Database[] => {
    const { databases } = this.state;
    const { selectedDatabaseId } = this.props;

    if (this.isJoinStep()) {
      return databases
        .filter((db) => !db.is_saved_questions)
        .filter((db) => db.id === selectedDatabaseId);
    }

    return databases.filter((db) => !db.is_saved_questions);
  };

  async hydrateActiveStep(): Promise<void> {
    if (
      this.isSavedEntitySelected() ||
      this.state.selectedDataBucketId === DATA_BUCKET.MODELS ||
      this.state.selectedDataBucketId === DATA_BUCKET.SAVED_QUESTIONS
    ) {
      await this.switchToStep(DATABASE_STEP);
    } else if (
      // Schema id is explicitly set when going through the New > Question/Model flow,
      // whereas we have to obtain it from the state when opening a saved question.
      this.state.selectedSchemaId ||
      this.state.selectedSchema?.id
    ) {
      await this.switchToStep(TABLE_STEP);
    } else if (this.isJoinStep()) {
      const querySourceType = this.props.querySourceType;
      if (querySourceType === "model") {
        await this.switchToStep(
          DATABASE_STEP,
          {
            selectedDataBucketId: DATA_BUCKET.MODELS,
          },
          false,
        );
      } else if (querySourceType === "question") {
        await this.switchToStep(
          DATABASE_STEP,
          {
            selectedDataBucketId: DATA_BUCKET.SAVED_QUESTIONS,
          },
          false,
        );
      } else {
        // query source is a table
        await this.switchToStep(SCHEMA_STEP);
      }
    } else if (!this.hasUsableModels() && !this.hasSavedQuestions()) {
      await this.switchToStep(DATABASE_STEP);
    } else {
      await this.switchToStep(DATA_BUCKET_STEP);
    }
  }

  // for steps where there's a single option sometimes we want to automatically select it
  skipSteps(): void {
    const { readOnly } = this.props;
    const { activeStep } = this.state;

    if (readOnly) {
      return;
    }

    if (activeStep === DATABASE_STEP && this.props.selectedDatabaseId == null) {
      const databases = this.getDatabases();
      if (databases && databases.length === 1) {
        this.onChangeDatabase(databases[0]);
      }
    }
    if (activeStep === SCHEMA_STEP && this.props.selectedSchemaId == null) {
      const { schemas } = this.state;
      if (schemas && schemas.length === 1) {
        this.onChangeSchema(schemas[0]);
      }
    }
    if (activeStep === DATA_BUCKET_STEP) {
      const dataTypes = getDataTypes({
        hasModels: this.hasModels(),
        hasTables: this.props.canSelectTable,
        hasSavedQuestions: this.hasSavedQuestions(),
        hasNestedQueriesEnabled: this.props.hasNestedQueriesEnabled,
      });
      if (dataTypes.length === 1) {
        this.onChangeDataBucket(dataTypes[0].id);
      }
    }
  }

  getNextStep(): DataSelectorStep | null {
    const { steps } = this.props;
    const index = steps.findIndex((step) => step === this.state.activeStep);
    return index < steps.length - 1 ? steps[index + 1] : null;
  }

  getPreviousStep(): DataSelectorStep | null {
    const { steps } = this.props;
    const { activeStep } = this.state;
    if (this.isSearchLoading() || activeStep === null) {
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
    if (steps[index] === SCHEMA_STEP && this.state.schemas.length === 1) {
      index -= 1;
    }

    // data bucket step doesn't make a lot of sense when there're no models or saved questions
    if (
      steps[index] === DATA_BUCKET_STEP &&
      !this.hasUsableModels() &&
      !this.hasSavedQuestions()
    ) {
      return null;
    }

    // can't go back to a previous step
    if (index < 0) {
      return null;
    }
    return steps[index];
  }

  togglePopoverOpen = (): void => {
    this.setStateWithComputedState({
      isPopoverOpen: !this.state.isPopoverOpen,
    });
  };

  nextStep = async (
    stateChange: Partial<DataSelectorState> = {},
    skipSteps = true,
  ): Promise<void> => {
    const nextStep = this.getNextStep();
    if (!nextStep) {
      await this.setStateWithComputedState({
        ...stateChange,
        isPopoverOpen: !this.state.isPopoverOpen,
      });
    } else {
      await this.switchToStep(nextStep, stateChange, skipSteps);
    }
  };

  previousStep = (): void => {
    const previousStep = this.getPreviousStep();
    if (previousStep) {
      const clearedState = this.getClearedStateForStep(previousStep);
      this.switchToStep(previousStep, clearedState, false);
    }
  };

  getClearedStateForStep(step: DataSelectorStep): Partial<DataSelectorState> {
    if (step === DATA_BUCKET_STEP) {
      return {
        selectedDataBucketId: null,
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
      };
    } else if (step === DATABASE_STEP) {
      return {
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
      };
    } else if (step === SCHEMA_STEP) {
      return {
        selectedSchemaId: null,
        selectedTableId: null,
      };
    } else if (step === TABLE_STEP) {
      return {
        selectedTableId: null,
      };
    }
    return {};
  }

  async loadStepData(stepName: DataSelectorStep): Promise<void> {
    const loadersForSteps: Record<
      DataSelectorStep,
      () => Promise<unknown> | undefined
    > = {
      // NOTE: make sure to return the action's resulting promise
      [DATA_BUCKET_STEP]: () => {
        return this.props.fetchDatabases();
      },
      [DATABASE_STEP]: () => {
        return this.props.fetchDatabases();
      },
      [SCHEMA_STEP]: () => {
        if (this.state.selectedDatabaseId != null) {
          return this.props.fetchSchemas(this.state.selectedDatabaseId);
        }
      },
      [TABLE_STEP]: () => {
        if (this.state.selectedSchemaId != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchemaId);
        } else if (this.state.selectedSchema?.id != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchema.id);
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

  hasPreloadedStepData(stepName: DataSelectorStep): boolean | undefined {
    const {
      hasLoadedDatabasesWithTables,
      hasLoadedDatabasesWithTablesSaved,
      hasLoadedDatabasesWithSaved,
    } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasLoadedDatabasesWithTablesSaved || hasLoadedDatabasesWithSaved;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      // A missing selectedDatabase counts as preloaded, skipping the step load.
      return (
        hasLoadedDatabasesWithTablesSaved ||
        (hasLoadedDatabasesWithTables &&
          !this.state.selectedDatabase?.is_saved_questions)
      );
    }
  }

  switchToStep = async (
    stepName: DataSelectorStep,
    stateChange: Partial<DataSelectorState> = {},
    shouldSkipSteps = true,
  ): Promise<void> => {
    await this.setStateWithComputedState({
      ...stateChange,
      activeStep: stepName,
    });
    if (!this.hasPreloadedStepData(stepName)) {
      await this.loadStepData(stepName);
    }
    if (shouldSkipSteps) {
      this.skipSteps();
    }
  };

  showSavedEntityPicker = ({ entityType }: { entityType?: CardType }): void =>
    this.setState({
      isSavedEntityPickerShown: true,
      savedEntityType: entityType,
    });

  onChangeDataBucket = async (
    selectedDataBucketId: DataPickerDataType,
  ): Promise<void> => {
    if (selectedDataBucketId === DATA_BUCKET.RAW_DATA) {
      await this.switchToStep(DATABASE_STEP, { selectedDataBucketId });
      return;
    }
    await this.switchToStep(
      DATABASE_STEP,
      {
        selectedDataBucketId,
      },
      false,
    );
    const database = this.props.databases.find((db) => db.is_saved_questions);
    if (database) {
      this.onChangeDatabase(database);
    }
  };

  onChangeDatabase = async (database: Database): Promise<void> => {
    if (database.is_saved_questions) {
      this.showSavedEntityPicker({ entityType: "question" });
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

  onChangeSchema = async (schema?: Schema): Promise<void> => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema && schema.id });
  };

  onChangeTable = async (table?: Table): Promise<void> => {
    if (this.props.setSourceTableFn && table?.id != null) {
      this.props.setSourceTableFn(table.id, table.db_id);
    }
    await this.nextStep({ selectedTableId: table?.id });
  };

  getTriggerElement = (): ReactNode => {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      triggerContentComponent: TriggerComponent,
      hasTriggerExpandControl,
      readOnly,
      isMantine,
    } = this.props;

    if (triggerElement) {
      return triggerElement;
    }

    const { selectedDatabase, selectedTable } = this.state;

    return (
      <Trigger
        className={className}
        style={style}
        showDropdownIcon={!readOnly && hasTriggerExpandControl}
        iconSize={isMantine ? "1rem" : triggerIconSize}
        isMantine={isMantine}
      >
        <TriggerComponent database={selectedDatabase} table={selectedTable} />
      </Trigger>
    );
  };

  getTriggerClasses(): string {
    const { readOnly, triggerClasses } = this.props;
    return cx(triggerClasses ?? cx(CS.flex, CS.alignCenter), {
      disabled: readOnly,
    });
  }

  handleSavedEntityPickerClose = (): void => {
    const { selectedDataBucketId } = this.state;
    if (selectedDataBucketId === DATA_BUCKET.MODELS || this.hasUsableModels()) {
      this.previousStep();
    }
    if (
      selectedDataBucketId === DATA_BUCKET.SAVED_QUESTIONS ||
      this.hasSavedQuestions()
    ) {
      this.previousStep();
    }
    this.setState({ isSavedEntityPickerShown: false, savedEntityType: null });
  };

  renderActiveStep(): ReactNode {
    const { steps, combineDatabaseSchemaSteps, hasNestedQueriesEnabled } =
      this.props;
    const hasNextStep = this.getNextStep() != null;
    const hasPreviousStep = this.getPreviousStep() != null;
    const hasBackButton =
      hasPreviousStep &&
      steps.includes(DATA_BUCKET_STEP) &&
      (this.hasUsableModels() || this.hasSavedQuestions());

    const props = {
      ...this.state,
      databases: this.getDatabases(),

      onChangeDataBucket: this.onChangeDataBucket,
      onChangeDatabase: this.onChangeDatabase,
      onChangeSchema: this.onChangeSchema,
      onChangeTable: this.onChangeTable,

      // misc
      isLoading: this.state.isLoading,
      hasNextStep,
      onBack: hasPreviousStep ? this.previousStep : null,
      hasFiltering: true,
      hasInitialFocus: true,
    };

    switch (this.state.activeStep) {
      case DATA_BUCKET_STEP:
        return (
          <Box p="sm">
            <DataBucketPicker
              dataTypes={getDataTypes({
                hasModels: this.hasModels(),
                hasTables: this.props.canSelectTable,
                hasSavedQuestions: this.hasSavedQuestions(),
                hasNestedQueriesEnabled,
              })}
              {...props}
            />
          </Box>
        );
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} hasBackButton={hasBackButton} />
        ) : (
          <DatabasePicker {...props} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} hasBackButton={hasBackButton} />
        ) : (
          <SchemaPicker {...props} />
        );
      case TABLE_STEP:
        return <TablePicker {...props} />;
    }

    return null;
  }

  isSavedEntitySelected = (): boolean =>
    isVirtualCardId(this.props.selectedTableId);

  handleSavedEntitySelect = async (tableOrCardId: string): Promise<void> => {
    await this.props.fetchFields(tableOrCardId);
    if (this.props.setSourceTableFn) {
      const table = this.props.metadata.table(tableOrCardId);
      this.props.setSourceTableFn(tableOrCardId, table?.db_id);
    }
    this.togglePopoverOpen();
    this.handleClose();
  };

  handleClose = (): void => {
    const { onClose } = this.props;
    if (typeof onClose === "function") {
      onClose();
    }
  };

  handleDismiss = (): void => {
    this.handleClose();
    this.setStateWithComputedState({
      isPopoverOpen: false,
    });
  };

  hasDataAccess = (): boolean => {
    const { hasDataAccess, databases } = this.props;
    return hasDataAccess || databases?.length > 0;
  };

  renderContent = (): ReactNode => {
    const { isSavedEntityPickerShown, selectedDataBucketId, selectedTable } =
      this.state;
    const { canChangeDatabase, selectedDatabaseId, selectedCollectionId } =
      this.props;

    const currentDatabaseId = canChangeDatabase ? null : selectedDatabaseId;

    const savedEntityBucketIds: (DataPickerDataType | null | undefined)[] = [
      DATA_BUCKET.MODELS,
      DATA_BUCKET.SAVED_QUESTIONS,
    ];
    const isPickerOpen =
      isSavedEntityPickerShown ||
      savedEntityBucketIds.includes(selectedDataBucketId);

    if (this.isSearchLoading()) {
      return <LoadingAndErrorWrapper loading />;
    }

    if (this.hasDataAccess()) {
      if (isPickerOpen) {
        return (
          <SavedEntityPicker
            collectionId={selectedCollectionId}
            type={this.getCardType()}
            tableId={selectedTable?.id}
            databaseId={currentDatabaseId}
            onSelect={this.handleSavedEntitySelect}
            onBack={this.handleSavedEntityPickerClose}
          />
        );
      }

      return this.renderActiveStep();
    }

    return (
      <Box w={CONTAINER_WIDTH} p="80px 60px">
        <EmptyState
          message={t`To pick some data, you'll need to add some first`}
          icon="database"
        />
      </Box>
    );
  };

  render(): ReactNode {
    if (this.props.isPopover) {
      const triggerElement = this.getTriggerElement();

      const triggerTargetClassName = cx(
        this.props.containerClassName,
        this.getTriggerClasses(),
      );

      return (
        <Popover
          onClose={this.handleClose}
          onDismiss={this.handleDismiss}
          position="bottom-start"
          opened={this.isPopoverOpen()}
        >
          <Popover.Target>
            <Box
              className={triggerTargetClassName}
              onClick={() => this.togglePopoverOpen()}
            >
              {triggerElement}
            </Box>
          </Popover.Target>

          <Popover.Dropdown aria-label={this.props.popoverAriaLabel}>
            {this.renderContent()}
          </Popover.Dropdown>
        </Popover>
      );
    }

    return this.renderContent();
  }
}

type ConnectOwnProps = DataSelectorOwnProps &
  SchemaFetchersProps &
  AvailableModelsInjectedProps & {
    availableModelsResult?: AvailableModelsResult;
  };

type WithoutSchemaFetchers = Omit<ConnectOwnProps, keyof SchemaFetchersProps>;

type PublicDataSelectorProps = DataSelectorOwnProps & { allLoading?: boolean };

// Exposes `fetchSchemas` / `fetchSchemaTables` as props backed by RTK's lazy
// query triggers. The triggers' subscriptions are tied to this wrapper's
// lifecycle, so the cache is released when the DataSelector unmounts.
function withSchemaFetchers(
  WrappedComponent: ComponentType<ConnectOwnProps>,
): ComponentType<WithoutSchemaFetchers> {
  return function DataSelectorWithSchemaFetchers(props: WithoutSchemaFetchers) {
    const [triggerListSchemas] = useLazyListDatabaseSchemasQuery();
    const [triggerListSchemaTables] = useLazyListDatabaseSchemaTablesQuery();

    const fetchSchemas = useCallback(
      (databaseId: DatabaseId) =>
        triggerListSchemas({ id: databaseId }).unwrap(),
      [triggerListSchemas],
    );

    const fetchSchemaTables = useCallback(
      (schemaId: SchemaId) => {
        const [dbId, schema] = parseSchemaId(schemaId);
        return triggerListSchemaTables({ id: dbId, schema }).unwrap();
      },
      [triggerListSchemaTables],
    );

    return (
      <WrappedComponent
        {...props}
        fetchSchemas={fetchSchemas}
        fetchSchemaTables={fetchSchemaTables}
      />
    );
  };
}

// If there is at least one model, we want to display a slightly different
// data picker view (see DATA_BUCKET step). Pre-fetches available models via
// search and exposes them as `availableModelsResult`/`loading`/`loaded` props.
function withAvailableModels(
  WrappedComponent: ComponentType<WithoutSchemaFetchers>,
): ComponentType<PublicDataSelectorProps> {
  return function DataSelectorWithAvailableModels(
    props: PublicDataSelectorProps,
  ) {
    const { data: response, isLoading } = useSearchQuery({
      calculate_available_models: true,
      limit: 0,
      models: ["dataset"],
      context: "data-picker",
    });
    let availableModelsResult: AvailableModelsResult | undefined;
    if (response) {
      const { data: _data, ...rest } = response;
      availableModelsResult = rest;
    }
    return (
      <WrappedComponent
        {...props}
        availableModelsResult={availableModelsResult}
        loading={isLoading}
        loaded={!isLoading && response != null}
        allLoading={isLoading || (props.allLoading ?? false)}
      />
    );
  };
}

// Prefetches the saved-databases list and forwards its loading state as
// `allLoading` so the picker waits for the databases (not just the models
// search) before hydrating its initial step. Without this the picker would
// briefly show only models and stream the databases in afterwards.
function withSavedDatabasesPrefetch(
  WrappedComponent: ComponentType<PublicDataSelectorProps>,
): ComponentType<PublicDataSelectorProps> {
  return function DataSelectorWithSavedDatabasesPrefetch(
    props: PublicDataSelectorProps,
  ) {
    const { isLoading } = useListDatabasesQuery({ saved: true });
    return (
      <WrappedComponent
        {...props}
        allLoading={isLoading || (props.allLoading ?? false)}
      />
    );
  };
}

const isListDatabasesQuerySuccess = (
  state: State,
  query: ListDatabasesRequest,
): boolean =>
  databaseApi.endpoints.listDatabases.select(query)(state).isSuccess;

const DataSelector = withSavedDatabasesPrefetch(
  withAvailableModels(
    withSchemaFetchers(
      connect(
        (state: State, ownProps: ConnectOwnProps): DataSelectorStateProps => {
          const response = databaseApi.endpoints.listDatabases.select({
            saved: true,
          })(state).data;
          const metadata = getMetadata(state);
          return {
            // `availableModelsResult` exposes the search response
            // (available_models, etc.). Not to be confused with Query
            // Builder's metadata.
            availableModels:
              ownProps.availableModelsResult?.available_models ?? [],
            metadata,
            databases: (response?.data ?? [])
              .map(({ id }) => metadata.database(id))
              .filter((database): database is Database => database != null),
            hasLoadedDatabasesWithTablesSaved: isListDatabasesQuerySuccess(
              state,
              {
                include: "tables",
                saved: true,
              },
            ),
            hasLoadedDatabasesWithSaved: isListDatabasesQuerySuccess(state, {
              saved: true,
            }),
            hasLoadedDatabasesWithTables: isListDatabasesQuerySuccess(state, {
              include: "tables",
            }),
            hasDataAccess: canUserCreateQueries(state),
            hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
            selectedQuestion: getMetadata(state).question(
              getQuestionIdFromVirtualTableId(ownProps.selectedTableId),
            ),
          };
        },
        (dispatch: Dispatch): DataSelectorDispatchProps => ({
          fetchDatabases: () =>
            runRtkEndpoint(
              { saved: true },
              dispatch,
              databaseApi.endpoints.listDatabases,
              { forceRefetch: false },
            ),
          fetchFields: (tableId) =>
            Promise.resolve(dispatch(fetchTableMetadata({ id: tableId }))),
          fetchQuestion: (id) =>
            runRtkEndpoint(
              { id: getQuestionIdFromVirtualTableId(id) },
              dispatch,
              cardApi.endpoints.getCard,
            ),
        }),
      )(UnconnectedDataSelector),
    ),
  ),
);

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
import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { canUserCreateQueries } from "metabase/selectors/user";
import { Box, Popover } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
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
  FieldId,
  FieldReference,
  ListDatabasesRequest,
  SchemaId,
  SearchModel,
  SearchResponse,
  TableId,
} from "metabase-types/api";

import { DataSelectorDataBucketPicker } from "./DataSelectorDataBucketPicker";
import { DataSelectorDatabasePicker } from "./DataSelectorDatabasePicker";
import { DataSelectorDatabaseSchemaPicker } from "./DataSelectorDatabaseSchemaPicker";
import { DataSelectorFieldPicker } from "./DataSelectorFieldPicker";
import { DataSelectorSchemaPicker } from "./DataSelectorSchemaPicker";
import { DataSelectorTablePicker } from "./DataSelectorTablePicker";
import {
  DatabaseTrigger,
  FieldTrigger,
  TableTrigger,
  Trigger,
  type TriggerComponentProps,
} from "./TriggerComponents";
import { CONTAINER_WIDTH, DATA_BUCKET } from "./constants";
import { SavedEntityPicker } from "./saved-entity-picker/SavedEntityPicker";
import type { DataPickerDataType } from "./types";
import { getDataTypes } from "./utils";

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

type DataSelectorStep =
  | typeof DATA_BUCKET_STEP
  | typeof DATABASE_STEP
  | typeof SCHEMA_STEP
  | typeof TABLE_STEP
  | typeof FIELD_STEP;

// The trimmed search response withAvailableModels hands to connect; only its
// `available_models` field is read, but it carries the rest of the payload.
type AvailableModelsResult = Omit<SearchResponse, "data">;

export interface DataSelectorOwnProps {
  steps: DataSelectorStep[];
  combineDatabaseSchemaSteps?: boolean;
  getTriggerElementContent?: ComponentType<TriggerComponentProps>;
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

  selectedDataBucketId?: DataPickerDataType | null;
  selectedDatabaseId?: DatabaseId | null;
  selectedSchemaId?: SchemaId | null;
  selectedTableId?: TableId | null;
  selectedFieldId?: FieldId | FieldReference | null;
  selectedCollectionId?: CollectionId;

  // Legacy props accepted for backwards compatibility but ignored. The selected
  // entities are derived from the corresponding `selected*Id` props above.
  selectedDatabase?: unknown;
  selectedSchema?: unknown;
  selectedTable?: unknown;
  selectedField?: unknown;
  triggerTabIndex?: number;

  databaseQuery?: ListDatabasesRequest;
  databases?: Database[];
  schemas?: Schema[];
  tables?: Table[];
  fields?: Field[];

  setDatabaseFn?: (databaseId: DatabaseId) => void;
  setFieldFn?: (fieldId: FieldId) => void;
  setSourceTableFn?: (tableId: TableId, databaseId?: DatabaseId) => void;
  tableFilter?: (table: Table) => boolean;
  fieldFilter?: (field: Field) => boolean;
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;

  canChangeDatabase?: boolean;
  canSelectModel?: boolean;
  canSelectTable?: boolean;
  canSelectMetric?: boolean;
  canSelectSavedQuestion?: boolean;
  useOnlyAvailableDatabase?: boolean;
  useOnlyAvailableSchema?: boolean;
  hideSingleSchema?: boolean;
  hideSingleDatabase?: boolean;
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
  fetchDatabases: (databaseQuery?: ListDatabasesRequest) => Promise<unknown>;
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
  fields: Field[];
  selectedField: Field | null;
}

interface DataSelectorState extends ComputedDataSelectorState {
  activeStep: DataSelectorStep | null;
  isLoading: boolean;
  isError: boolean;
  isPopoverOpen: boolean;
  isSavedEntityPickerShown: boolean;
  savedEntityType: CardType | null;
  selectedDataBucketId: DataPickerDataType | null;
  selectedDatabaseId: DatabaseId | null;
  selectedSchemaId: SchemaId | null;
  selectedTableId: TableId | null;
  selectedFieldId: FieldId | FieldReference | null;
}

type SelectedIdsState = Pick<
  DataSelectorState,
  | "selectedDatabaseId"
  | "selectedSchemaId"
  | "selectedTableId"
  | "selectedFieldId"
>;

export function DataSourceSelector(props: Omit<DataSelectorOwnProps, "steps">) {
  return (
    <DataSelector
      steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      combineDatabaseSchemaSteps
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function DatabaseDataSelector(
  props: Omit<DataSelectorOwnProps, "steps">,
) {
  return (
    <DataSelector
      steps={[DATABASE_STEP]}
      getTriggerElementContent={DatabaseTrigger}
      {...props}
    />
  );
}

export function DatabaseSchemaAndTableDataSelector(
  props: Omit<DataSelectorOwnProps, "steps">,
) {
  return (
    <DataSelector
      steps={[DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      combineDatabaseSchemaSteps
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function SchemaAndTableDataSelector(
  props: Omit<DataSelectorOwnProps, "steps">,
) {
  return (
    <DataSelector
      steps={[SCHEMA_STEP, TABLE_STEP]}
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function SchemaTableAndFieldDataSelector(
  props: Omit<DataSelectorOwnProps, "steps">,
) {
  return (
    <DataSelector
      steps={[SCHEMA_STEP, TABLE_STEP, FIELD_STEP]}
      getTriggerElementContent={FieldTrigger}
      // We don't want to change styles when there's a different trigger element
      isMantine={!props.getTriggerElementContent}
      {...props}
    />
  );
}

export function FieldDataSelector(props: Omit<DataSelectorOwnProps, "steps">) {
  return (
    <DataSelector
      steps={[FIELD_STEP]}
      getTriggerElementContent={FieldTrigger}
      {...props}
    />
  );
}

export class UnconnectedDataSelector extends Component<
  DataSelectorProps,
  DataSelectorState
> {
  static defaultProps = {
    isInitiallyOpen: false,
    useOnlyAvailableDatabase: true,
    useOnlyAvailableSchema: true,
    hideSingleSchema: true,
    hideSingleDatabase: false,
    canChangeDatabase: true,
    hasTriggerExpandControl: true,
    isPopover: true,
    isMantine: false,
    canSelectModel: true,
    canSelectTable: true,
    canSelectMetric: false,
    canSelectSavedQuestion: true,
  };

  constructor(props: DataSelectorProps) {
    super(props);

    const state: SelectedIdsState & {
      selectedDataBucketId: DataPickerDataType | null;
      isSavedEntityPickerShown: boolean;
      savedEntityType: CardType | null;
      isPopoverOpen: boolean;
    } = {
      selectedDataBucketId: props.selectedDataBucketId ?? null,
      selectedDatabaseId: props.selectedDatabaseId ?? null,
      selectedSchemaId: props.selectedSchemaId ?? null,
      selectedTableId: props.selectedTableId ?? null,
      selectedFieldId: props.selectedFieldId ?? null,
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

  isPopoverOpen() {
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
  // 1. pass in databases/schemas/tables/fields as props
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
    const { metadata, tableFilter, fieldFilter } = props;
    const {
      selectedDatabaseId,
      selectedSchemaId,
      selectedTableId,
      selectedFieldId,
    } = state;

    let { databases, schemas, tables, fields } = props;
    let selectedDatabase: Database | null = null;
    let selectedSchema: Schema | null = null;
    let selectedTable: Table | null = null;
    let selectedField: Field | null = null;

    const getDatabase = (id: DatabaseId) =>
      _.findWhere(databases, { id }) || metadata.database(id);
    const getSchema = (id: SchemaId) =>
      _.findWhere(schemas ?? [], { id }) || metadata.schema(id);
    const getTable = (id: TableId) =>
      _.findWhere(tables ?? [], { id }) || metadata.table(id);
    const getField = (id: FieldId | FieldReference) =>
      _.findWhere(fields ?? [], { id }) || metadata.field(id);

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

    const deriveFromTable = (table: Table | null) => {
      if (!fields && table) {
        fields = table.fields;
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
      deriveFromTable(selectedTable);
    }
    if (selectedFieldId != null) {
      selectedField = getField(selectedFieldId) ?? null;
    }
    // now do it in in reverse to propagate it back up
    if (!selectedTable && selectedField) {
      selectedTable = selectedField.table ?? null;
      deriveFromTable(selectedTable);
    }
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

    if (fields && fieldFilter) {
      fields = fields.filter(fieldFilter);
    }

    return {
      databases: databases || [],
      selectedDatabase: selectedDatabase ?? null,
      schemas: schemas || [],
      selectedSchema: selectedSchema ?? null,
      tables: tables || [],
      selectedTable: selectedTable ?? null,
      fields: fields || [],
      selectedField: selectedField ?? null,
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
      // This is a partial state update that React merges into the current
      // state. The cast is needed only because `Partial` widens the id fields
      // with `undefined`, which callers never actually pass.
      this.setState(
        { ...newState, ...computedState } as Pick<
          DataSelectorState,
          keyof DataSelectorState
        >,
        resolve,
      );
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps: DataSelectorProps) {
    const newState: Partial<DataSelectorState> = {};
    if (
      nextProps.selectedDatabaseId !== this.props.selectedDatabaseId &&
      this.state.selectedDatabaseId !== nextProps.selectedDatabaseId
    ) {
      newState.selectedDatabaseId = nextProps.selectedDatabaseId ?? null;
    }
    if (
      nextProps.selectedSchemaId !== this.props.selectedSchemaId &&
      this.state.selectedSchemaId !== nextProps.selectedSchemaId
    ) {
      newState.selectedSchemaId = nextProps.selectedSchemaId ?? null;
    }
    if (
      nextProps.selectedTableId !== this.props.selectedTableId &&
      this.state.selectedTableId !== nextProps.selectedTableId
    ) {
      newState.selectedTableId = nextProps.selectedTableId ?? null;
    }
    if (
      nextProps.selectedFieldId !== this.props.selectedFieldId &&
      this.state.selectedFieldId !== nextProps.selectedFieldId
    ) {
      newState.selectedFieldId = nextProps.selectedFieldId ?? null;
    }
    if (Object.keys(newState).length > 0) {
      this.setStateWithComputedState(newState, nextProps);
    } else if (nextProps.metadata !== this.props.metadata) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount() {
    const { activeStep } = this.state;
    const {
      fetchFields,
      fetchQuestion,
      selectedDataBucketId,
      selectedTableId: sourceId,
    } = this.props;

    if (!this.isSearchLoading() && !activeStep) {
      await this.hydrateActiveStep();
    }

    if (selectedDataBucketId === DATA_BUCKET.MODELS) {
      this.showSavedEntityPicker({ entityType: "model" });
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

  async componentDidUpdate(prevProps: DataSelectorProps) {
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
    const {
      activeStep,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
      schemas,
    } = this.state;

    const invalidSchema =
      selectedDatabase &&
      selectedSchema &&
      selectedSchema.database &&
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
      selectedTable.schema?.id !== selectedSchema.id;

    const invalidField =
      selectedTable &&
      selectedField &&
      selectedField.table?.id !== selectedTable.id;

    // A database with a single schema auto-selects it (see `skipSteps`). When the
    // schema list arrives asynchronously *after* we already switched to the schema
    // step (e.g. a freshly selected Mongo database in the native editor), that
    // auto-selection ran against stale state and didn't advance, leaving us
    // stranded on the schema step. Retry it now that the schema is available,
    // but only if schema selection is truly missing in both controlled and
    // uncontrolled usage.
    const onStepMissingOnlySchemaSelection =
      activeStep === SCHEMA_STEP &&
      !selectedSchema &&
      this.props.useOnlyAvailableSchema &&
      !this.props.readOnly &&
      this.props.selectedSchemaId == null &&
      this.state.selectedSchemaId == null &&
      schemas.length === 1;

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
    } else if (onStepMissingOnlySchemaSelection) {
      await this.onChangeSchema(schemas[0]);
    }
  }

  isSearchLoading = () => {
    return this.props.loading;
  };

  getCardType(): CardType {
    const { selectedDataBucketId, savedEntityType } = this.state;
    switch (true) {
      case selectedDataBucketId === DATA_BUCKET.MODELS ||
        savedEntityType === "model":
        return "model";
      case selectedDataBucketId === DATA_BUCKET.METRICS ||
        savedEntityType === "metric":
        return "metric";
      default:
        return "question";
    }
  }

  hasModels = () => {
    const { availableModels, canSelectModel, loaded } = this.props;
    return loaded && !!canSelectModel && availableModels.includes("dataset");
  };

  hasUsableModels = () => {
    // As models are actually saved questions, nested queries must be enabled
    return this.hasModels() && this.props.hasNestedQueriesEnabled;
  };

  hasMetrics = () => {
    const { availableModels, canSelectMetric, loaded } = this.props;
    return loaded && !!canSelectMetric && availableModels.includes("metric");
  };

  hasUsableMetrics = () => {
    // As metrics are actually saved questions, nested queries must be enabled
    return this.hasMetrics() && this.props.hasNestedQueriesEnabled;
  };

  hasUsableModelsOrMetrics = () => {
    return this.hasUsableModels() || this.hasUsableMetrics();
  };

  hasSavedQuestions = () => {
    const { canSelectSavedQuestion } = this.props;
    return (
      this.state.databases.some((database) => database.is_saved_questions) &&
      !!canSelectSavedQuestion
    );
  };

  getDatabases = () => {
    const { databases } = this.state;

    // When there is at least one dataset,
    // "Saved Questions" are presented in a different picker step
    // So it should be excluded from a regular databases list
    const shouldRemoveSavedQuestionDatabaseFromList =
      !this.props.hasNestedQueriesEnabled ||
      this.hasUsableModelsOrMetrics() ||
      !this.props.canSelectSavedQuestion;

    return shouldRemoveSavedQuestionDatabaseFromList
      ? databases.filter((db) => !db.is_saved_questions)
      : databases;
  };

  async hydrateActiveStep() {
    const { steps } = this.props;
    if (
      this.isSavedEntitySelected() ||
      this.state.selectedDataBucketId === DATA_BUCKET.MODELS ||
      this.state.selectedDataBucketId === DATA_BUCKET.SAVED_QUESTIONS
    ) {
      await this.switchToStep(DATABASE_STEP);
    } else if (this.state.selectedTableId && steps.includes(FIELD_STEP)) {
      await this.switchToStep(FIELD_STEP);
    } else if (
      // Schema id is explicitly set when going through the New > Question/Model flow,
      // whereas we have to obtain it from the state when opening a saved question.
      (this.state.selectedSchemaId || this.state.selectedSchema?.id) &&
      steps.includes(TABLE_STEP)
    ) {
      await this.switchToStep(TABLE_STEP);
    } else if (this.state.selectedDatabaseId && steps.includes(SCHEMA_STEP)) {
      await this.switchToStep(SCHEMA_STEP);
    } else if (
      steps[0] === DATA_BUCKET_STEP &&
      !this.hasUsableModelsOrMetrics()
    ) {
      await this.switchToStep(steps[1]);
    } else {
      await this.switchToStep(steps[0]);
    }
  }

  // for steps where there's a single option sometimes we want to automatically select it
  // if `useOnlyAvailable*` prop is provided
  skipSteps() {
    const { readOnly, databaseIsDisabled } = this.props;
    const { activeStep } = this.state;

    if (readOnly) {
      return;
    }

    if (
      activeStep === DATABASE_STEP &&
      this.props.useOnlyAvailableDatabase &&
      this.props.selectedDatabaseId == null
    ) {
      const databases = this.getDatabases();
      const enabledDatabases = databases.filter(
        (db) => !databaseIsDisabled?.(db),
      );
      if (enabledDatabases.length >= 1) {
        this.onChangeDatabase(enabledDatabases[0]);
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

  getNextStep(): DataSelectorStep | null {
    const { steps } = this.props;
    const index = steps.indexOf(this.state.activeStep as DataSelectorStep);
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
    if (
      steps[index] === SCHEMA_STEP &&
      this.props.useOnlyAvailableSchema &&
      this.state.schemas.length === 1
    ) {
      index -= 1;
    }

    // data bucket step doesn't make a lot of sense when there're no models or metrics
    if (steps[index] === DATA_BUCKET_STEP && !this.hasUsableModelsOrMetrics()) {
      return null;
    }

    // can't go back to a previous step
    if (index < 0) {
      return null;
    }
    return steps[index];
  }

  togglePopoverOpen = () => {
    this.setStateWithComputedState({
      isPopoverOpen: !this.state.isPopoverOpen,
    });
  };

  nextStep = async (
    stateChange: Partial<DataSelectorState> = {},
    skipSteps = true,
  ) => {
    const nextStep = this.getNextStep();
    if (!nextStep) {
      await this.setStateWithComputedState({
        ...stateChange,
        isPopoverOpen: false,
      });
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

  getClearedStateForStep(step: DataSelectorStep): Partial<DataSelectorState> {
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

  async loadStepData(stepName: DataSelectorStep) {
    const loadersForSteps: Record<
      DataSelectorStep,
      (() => Promise<unknown> | undefined) | undefined
    > = {
      // NOTE: make sure to return the action's resulting promise
      [DATA_BUCKET_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchDatabases({ saved: true }),
        ]);
      },
      [DATABASE_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchDatabases({ saved: true }),
        ]);
      },
      [SCHEMA_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.state.selectedDatabaseId != null
            ? this.props.fetchSchemas(this.state.selectedDatabaseId)
            : undefined,
        ]);
      },
      [TABLE_STEP]: () => {
        if (this.state.selectedSchemaId != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchemaId);
        } else if (this.state.selectedSchema?.id != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchema.id);
        }
      },
      [FIELD_STEP]: () => {
        if (this.state.selectedTableId != null) {
          return this.props.fetchFields(this.state.selectedTableId);
        }
      },
    };

    const loader = loadersForSteps[stepName];
    if (loader) {
      try {
        await this.setStateWithComputedState({
          isLoading: true,
          isError: false,
        });
        await loader();
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

  hasPreloadedStepData(stepName: DataSelectorStep): boolean {
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
          !this.state.selectedDatabase?.is_saved_questions)
      );
    } else if (stepName === FIELD_STEP) {
      return this.state.fields.length > 0;
    }
    return false;
  }

  switchToStep = async (
    stepName: DataSelectorStep,
    stateChange: Partial<DataSelectorState> = {},
    skipSteps = true,
  ) => {
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

  showSavedEntityPicker = ({ entityType }: { entityType?: CardType }) =>
    this.setState({
      isSavedEntityPickerShown: true,
      savedEntityType: entityType ?? null,
    });

  onChangeDataBucket = async (selectedDataBucketId: DataPickerDataType) => {
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

  onChangeDatabase = async (database: Database) => {
    if (database.is_saved_questions) {
      this.showSavedEntityPicker({ entityType: "question" });
      return;
    }

    if (this.props.setDatabaseFn) {
      this.props.setDatabaseFn(database.id);
    }

    if (this.state.selectedDatabaseId != null) {
      // If we already had a database selected, we need to go back and clear
      // data before advancing to the next step.
      await this.previousStep();
    }
    await this.nextStep({ selectedDatabaseId: database && database.id });
  };

  onChangeSchema = async (schema?: Schema) => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema?.id ?? null });
  };

  onChangeTable = async (table?: Table) => {
    if (this.props.setSourceTableFn && table?.id != null) {
      this.props.setSourceTableFn(table.id, table.db_id);
    }
    await this.nextStep({ selectedTableId: table?.id ?? null });
  };

  onChangeField = async (field?: Field) => {
    const fieldId = field?.id;
    if (this.props.setFieldFn && typeof fieldId === "number") {
      this.props.setFieldFn(fieldId);
    }
    await this.nextStep({ selectedFieldId: fieldId ?? null });
  };

  getTriggerElement = (triggerProps?: Partial<TriggerComponentProps>) => {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      getTriggerElementContent: TriggerComponent,
      hasTriggerExpandControl,
      readOnly,
      isMantine,
    } = this.props;

    if (triggerElement) {
      return triggerElement;
    }

    const { selectedDatabase, selectedTable, selectedField } = this.state;

    return (
      <Trigger
        className={className}
        style={style}
        showDropdownIcon={!readOnly && hasTriggerExpandControl}
        iconSize={isMantine ? "1rem" : triggerIconSize}
        isMantine={isMantine}
      >
        {TriggerComponent && (
          <TriggerComponent
            database={selectedDatabase}
            table={selectedTable}
            field={selectedField}
            {...triggerProps}
          />
        )}
      </Trigger>
    );
  };

  getTriggerClasses() {
    const { readOnly, triggerClasses } = this.props;
    return cx(triggerClasses ?? cx(CS.flex, CS.alignCenter), {
      disabled: readOnly,
    });
  }

  handleSavedEntityPickerClose = () => {
    const { selectedDataBucketId } = this.state;
    if (selectedDataBucketId === DATA_BUCKET.MODELS || this.hasUsableModels()) {
      this.previousStep();
    }
    if (
      selectedDataBucketId === DATA_BUCKET.METRICS ||
      this.hasUsableMetrics()
    ) {
      this.previousStep();
    }
    this.setState({ isSavedEntityPickerShown: false, savedEntityType: null });
  };

  renderActiveStep() {
    const { steps, combineDatabaseSchemaSteps, hasNestedQueriesEnabled } =
      this.props;
    const hasNextStep = this.getNextStep() != null;
    const hasPreviousStep = this.getPreviousStep() != null;
    const hasBackButton =
      hasPreviousStep &&
      steps.includes(DATA_BUCKET_STEP) &&
      this.hasUsableModelsOrMetrics();

    const stepProps = {
      ...this.state,
      databases: this.getDatabases(),
      selectedDatabase: this.state.selectedDatabase ?? undefined,
      selectedSchema: this.state.selectedSchema ?? undefined,
      selectedTable: this.state.selectedTable ?? undefined,
      selectedField: this.state.selectedField ?? undefined,
      selectedSchemaId: this.state.selectedSchemaId ?? undefined,

      onChangeDataBucket: this.onChangeDataBucket,
      onChangeDatabase: this.onChangeDatabase,
      onChangeSchema: this.onChangeSchema,
      onChangeTable: this.onChangeTable,
      onChangeField: this.onChangeField,

      // misc
      isLoading: this.state.isLoading,
      hasNextStep,
      onBack: hasPreviousStep ? this.previousStep : undefined,
      hasFiltering: true,
      hasInitialFocus: true,
      databaseIsDisabled: this.props.databaseIsDisabled,
      databaseDisabledTooltip: this.props.databaseDisabledTooltip,
    };

    switch (this.state.activeStep) {
      case DATA_BUCKET_STEP:
        return (
          <Box p="sm">
            <DataSelectorDataBucketPicker
              dataTypes={getDataTypes({
                hasModels: this.hasModels(),
                hasTables: !!this.props.canSelectTable,
                hasNestedQueriesEnabled,
                hasSavedQuestions: this.hasSavedQuestions(),
                hasMetrics: this.hasMetrics(),
              })}
              {...stepProps}
            />
          </Box>
        );
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DataSelectorDatabaseSchemaPicker
            {...stepProps}
            hasBackButton={hasBackButton}
          />
        ) : (
          <DataSelectorDatabasePicker {...stepProps} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DataSelectorDatabaseSchemaPicker
            {...stepProps}
            hasBackButton={hasBackButton}
          />
        ) : (
          <DataSelectorSchemaPicker {...stepProps} />
        );
      case TABLE_STEP:
        return <DataSelectorTablePicker {...stepProps} />;
      case FIELD_STEP:
        return <DataSelectorFieldPicker {...stepProps} />;
    }

    return null;
  }

  isSavedEntitySelected = () => isVirtualCardId(this.props.selectedTableId);

  handleSavedEntitySelect = async (tableOrCardId: string) => {
    await this.props.fetchFields(tableOrCardId);
    if (this.props.setSourceTableFn) {
      const table = this.props.metadata.table(tableOrCardId);
      this.props.setSourceTableFn(tableOrCardId, table?.db_id);
    }
    this.togglePopoverOpen();
    this.handleClose();
  };

  handleClose = () => {
    const { onClose } = this.props;
    if (typeof onClose === "function") {
      onClose();
    }
  };

  handleDismiss = () => {
    this.handleClose();
    this.setStateWithComputedState({
      isPopoverOpen: false,
    });
  };

  hasDataAccess = () => {
    const { hasDataAccess, databases } = this.props;
    return hasDataAccess || databases?.length > 0;
  };

  renderContent = () => {
    const { isSavedEntityPickerShown, selectedDataBucketId, selectedTable } =
      this.state;
    const { canChangeDatabase, selectedDatabaseId, selectedCollectionId } =
      this.props;

    const currentDatabaseId = canChangeDatabase ? null : selectedDatabaseId;

    const isPickerOpen =
      isSavedEntityPickerShown || selectedDataBucketId === DATA_BUCKET.MODELS;

    if (this.isSearchLoading()) {
      return <LoadingAndErrorWrapper loading />;
    }

    if (this.hasDataAccess()) {
      if (isPickerOpen) {
        return (
          <SavedEntityPicker
            collectionId={selectedCollectionId}
            type={this.getCardType()}
            tableId={
              typeof selectedTable?.id === "string"
                ? selectedTable.id
                : undefined
            }
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

  render() {
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
          disabled={this.props.readOnly}
        >
          <Popover.Target>
            <Box
              className={triggerTargetClassName}
              onClick={() => this.togglePopoverOpen()}
            >
              {triggerElement}
            </Box>
          </Popover.Target>

          <Popover.Dropdown>{this.renderContent()}</Popover.Dropdown>
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
        triggerListSchemas({ id: databaseId, "can-query": true }).unwrap(),
      [triggerListSchemas],
    );

    const fetchSchemaTables = useCallback(
      (schemaId: SchemaId) => {
        const [dbId, schema] = parseSchemaId(schemaId);
        return triggerListSchemaTables({
          id: dbId,
          schema,
          "can-query": true,
        }).unwrap();
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

// If there is at least one model or metric, we want to display a slightly
// different data picker view (see DATA_BUCKET step). Pre-fetches available
// models via search and exposes them as `availableModelsResult`/`loading`/`loaded` props.
function withAvailableModels(
  WrappedComponent: ComponentType<WithoutSchemaFetchers>,
): ComponentType<DataSelectorOwnProps> {
  return function DataSelectorWithAvailableModels(props: DataSelectorOwnProps) {
    const { data: response, isLoading } = useSearchQuery({
      calculate_available_models: true,
      limit: 0,
      models: ["dataset", "metric"],
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
        allLoading={isLoading}
      />
    );
  };
}

function withDatabaseList(
  WrappedComponent: ComponentType<DataSelectorOwnProps>,
): ComponentType<DataSelectorOwnProps> {
  return function DataSelectorWithDatabaseList(props: DataSelectorOwnProps) {
    useListDatabasesQuery({ "can-query": true });
    return <WrappedComponent {...props} />;
  };
}

const isListDatabasesQuerySuccess = (
  state: State,
  query: ListDatabasesRequest,
) => databaseApi.endpoints.listDatabases.select(query)(state).isSuccess;

const mapStateToProps = (
  state: State,
  ownProps: ConnectOwnProps,
): DataSelectorStateProps => {
  const databaseQuery: ListDatabasesRequest = {
    ...ownProps.databaseQuery,
    "can-query": true,
  };
  const queriedDatabases =
    databaseApi.endpoints.listDatabases.select(databaseQuery)(state).data?.data;
  const metadata = getMetadata(state);
  return {
    availableModels: ownProps.availableModelsResult?.available_models ?? [],
    metadata,
    databases:
      ownProps.databases ||
      queriedDatabases
        ?.map(({ id }) => metadata.database(id))
        .filter((database): database is Database => database != null) ||
      [],
    hasLoadedDatabasesWithTablesSaved: isListDatabasesQuerySuccess(state, {
      include: "tables",
      saved: true,
      "can-query": true,
    }),
    hasLoadedDatabasesWithSaved: isListDatabasesQuerySuccess(state, {
      saved: true,
      "can-query": true,
    }),
    hasLoadedDatabasesWithTables: isListDatabasesQuerySuccess(state, {
      include: "tables",
      "can-query": true,
    }),
    hasDataAccess: canUserCreateQueries(state),
    hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
    selectedQuestion: getMetadata(state).question(
      getQuestionIdFromVirtualTableId(ownProps.selectedTableId),
    ),
  };
};

const mapDispatchToProps = (dispatch: Dispatch): DataSelectorDispatchProps => ({
  fetchDatabases: (databaseQuery) =>
    runRtkEndpoint(
      { ...databaseQuery, "can-query": true },
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
});

const DataSelector = withDatabaseList(
  withAvailableModels(
    withSchemaFetchers(
      connect(mapStateToProps, mapDispatchToProps)(UnconnectedDataSelector),
    ),
  ),
);

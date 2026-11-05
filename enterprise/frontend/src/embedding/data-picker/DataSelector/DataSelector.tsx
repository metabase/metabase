import cx from "classnames";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { Component, useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import {
  cardApi,
  databaseApi,
  tableApi,
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
import type {
  DataSource,
  DataSourceSelectorProps,
} from "metabase/embedding-sdk/types/components/data-picker";
import { getShallowQuestions } from "metabase/metadata-store";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
  type DataSelectorDatabase,
  type DataSelectorSchema,
  type DataSelectorTable,
  type EntityLookups,
  getEntityLookups,
} from "metabase/querying/common/components/DataSelector";
import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { Box, Popover } from "metabase/ui";
import { parseSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CardId,
  CardType,
  CollectionId,
  DatabaseId,
  LibraryCollection,
  ListDatabasesRequest,
  SchemaId,
  SearchModel,
  SearchResponse,
  Table,
  TableId,
} from "metabase-types/api";

import { DataSelectorDataBucketPicker as DataBucketPicker } from "../DataSelectorDataBucketPicker";
import { DataSelectorDatabasePicker as DatabasePicker } from "../DataSelectorDatabasePicker";
import { DataSelectorSchemaPicker as SchemaPicker } from "../DataSelectorSchemaPicker";
import { DataSelectorTablePicker as TablePicker } from "../DataSelectorTablePicker";
import {
  TableTrigger,
  Trigger,
  type TriggerComponentProps,
} from "../TriggerComponents";
import { CONTAINER_WIDTH, DATA_BUCKET } from "../constants";
import { LibraryPicker } from "../library-picker/LibraryPicker";
import { SavedEntityPicker } from "../saved-entity-picker/SavedEntityPicker";
import type { DataPickerDataType, SavedEntityType } from "../types";
import { getDataTypes } from "../utils";

// chooses a data source bucket (datasets / raw data (tables) / saved questions)
const DATA_BUCKET_STEP = "BUCKET";
// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table or a metric published in the Library
const LIBRARY_STEP = "LIBRARY";
// chooses a model
const MODEL_STEP = "MODEL";
// chooses a saved question
const SAVED_QUESTION_STEP = "SAVED_QUESTION";
// chooses a metric
const METRIC_STEP = "METRIC";

type DataSelectorStep =
  | typeof DATA_BUCKET_STEP
  | typeof DATABASE_STEP
  | typeof SCHEMA_STEP
  | typeof TABLE_STEP
  | typeof LIBRARY_STEP
  | typeof MODEL_STEP
  | typeof SAVED_QUESTION_STEP
  | typeof METRIC_STEP;

// Each step's parent; back climbs it to the closest step with a choice
const PARENT_STEP = {
  [DATA_BUCKET_STEP]: null,
  [DATABASE_STEP]: DATA_BUCKET_STEP,
  [SCHEMA_STEP]: DATABASE_STEP,
  [TABLE_STEP]: SCHEMA_STEP,
  [LIBRARY_STEP]: DATA_BUCKET_STEP,
  [MODEL_STEP]: DATA_BUCKET_STEP,
  [SAVED_QUESTION_STEP]: DATA_BUCKET_STEP,
  [METRIC_STEP]: DATA_BUCKET_STEP,
} as const satisfies Record<DataSelectorStep, DataSelectorStep | null>;

const SAVED_ENTITY_TYPE_BY_STEP: Partial<
  Record<DataSelectorStep, SavedEntityType>
> = {
  [MODEL_STEP]: "model",
  [SAVED_QUESTION_STEP]: "question",
  [METRIC_STEP]: "metric",
};

const STEP_BY_CARD_TYPE = {
  model: MODEL_STEP,
  question: SAVED_QUESTION_STEP,
  metric: METRIC_STEP,
} as const satisfies Record<CardType, DataSelectorStep>;

// The trimmed search response withAvailableModels hands to connect; only its
// `available_models` field is read, but it carries the rest of the payload.
type AvailableModelsResult = Omit<SearchResponse, "data">;

interface DataSelectorOwnProps {
  steps: DataSelectorStep[];
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
  canSelectMetric: boolean;
  canSelectSemanticLayer: boolean;

  selectedDatabaseId?: DatabaseId | null;
  selectedSchemaId?: SchemaId | null;
  selectedTableId?: TableId | null;
  selectedCardId?: CardId | null;
  selectedCollectionId?: CollectionId | null;

  databases?: DataSelectorDatabase[];
  schemas?: DataSelectorSchema[];
  tables?: DataSelectorTable[];

  setDatabaseFn?: (databaseId: DatabaseId) => void;
  setSourceFn?: (source: DataSource) => void;
  tableFilter?: (table: DataSelectorTable) => boolean;
}

interface DataSelectorStateProps {
  availableModels: SearchModel[];
  entityLookups: EntityLookups;
  databases: DataSelectorDatabase[];
  hasLoadedDatabases: boolean;
  hasLoadedDatabasesWithTables: boolean;
  hasDataAccess: boolean;
  hasNestedQueriesEnabled: boolean;
  selectedCardType?: CardType;
}

interface DataSelectorDispatchProps {
  fetchDatabases: () => Promise<unknown>;
  fetchFields: (tableId: TableId) => Promise<Table>;
  fetchQuestion: (id: CardId) => Promise<unknown>;
}

interface SchemaFetchersProps {
  fetchSchemas: (databaseId: DatabaseId) => Promise<unknown>;
  fetchSchemaTables: (schemaId: SchemaId) => Promise<unknown>;
}

interface LibraryInjectedProps {
  libraryCollection?: LibraryCollection;
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
  AvailableModelsInjectedProps &
  LibraryInjectedProps;

interface ComputedDataSelectorState {
  databases: DataSelectorDatabase[];
  selectedDatabase: DataSelectorDatabase | null;
  schemas: DataSelectorSchema[];
  selectedSchema: DataSelectorSchema | null;
  tables: DataSelectorTable[];
  selectedTable: DataSelectorTable | null;
}

interface DataSelectorState extends ComputedDataSelectorState {
  activeStep: DataSelectorStep | null;
  hasCardRequestFailed: boolean;
  isLoading: boolean;
  isError: boolean;
  isPopoverOpen: boolean;
  selectedDatabaseId: DatabaseId | null | undefined;
  selectedSchemaId: SchemaId | null | undefined;
  selectedTableId: TableId | null | undefined;
  // The Library collection a reopened table is published in, to open on it
  selectedLibraryCollectionId: CollectionId | null;
}

type SelectedIdsState = Pick<
  DataSelectorState,
  "selectedDatabaseId" | "selectedSchemaId" | "selectedTableId"
>;

export function DataSourceSelector(props: DataSourceSelectorProps) {
  // Reads the Library through `PLUGIN_LIBRARY`, like the core app's pickers.
  // `libraryCollection` stays `undefined` without the `library` token feature (no
  // request is made), when no Library exists (`GET /api/ee/library` returns
  // `{ data: null }`), or when the user can't read it. `allLoading` makes the
  // picker wait for it.
  const { data: libraryCollection, isLoading: isLibraryLoading } =
    PLUGIN_LIBRARY.useGetLibraryCollection({
      skip: !props.canSelectSemanticLayer,
    });

  return (
    <DataSelector
      steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      triggerContentComponent={TableTrigger}
      {...props}
      libraryCollection={libraryCollection}
      allLoading={isLibraryLoading}
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
      selectedDatabaseId: props.selectedDatabaseId,
      selectedSchemaId: props.selectedSchemaId,
      selectedTableId: props.selectedTableId,
      selectedLibraryCollectionId: null,
      isPopoverOpen: Boolean(props.isInitiallyOpen && !props.readOnly),
    };
    const computedState = this._getComputedState(props, state);
    this.state = {
      activeStep: null,
      hasCardRequestFailed: false,
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
    const { entityLookups, tableFilter } = props;
    const { selectedDatabaseId, selectedSchemaId, selectedTableId } = state;

    let { databases, schemas, tables } = props;
    let selectedDatabase: DataSelectorDatabase | null = null,
      selectedSchema: DataSelectorSchema | null = null,
      selectedTable: DataSelectorTable | null = null;

    const getDatabase = (id: DatabaseId) =>
      _.findWhere(databases ?? [], { id }) || entityLookups.database(id);
    const getSchema = (id: SchemaId) =>
      _.findWhere(schemas ?? [], { id }) || entityLookups.schema(id);
    const getTable = (id: TableId) =>
      _.findWhere(tables ?? [], { id }) || entityLookups.table(id);

    const deriveFromDatabase = (database: DataSelectorDatabase | null) => {
      if (!schemas && database) {
        schemas = entityLookups.databaseSchemas(database.id);
      }
      if (!tables && Array.isArray(schemas) && schemas.length === 1) {
        tables = entityLookups.schemaTables(schemas[0].id);
      }
    };

    const deriveFromSchema = (schema: DataSelectorSchema | null) => {
      if (!tables && schema) {
        tables = entityLookups.schemaTables(schema.id);
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
      selectedSchema = entityLookups.tableSchema(selectedTable.id) ?? null;
      deriveFromSchema(selectedSchema);
    }
    if (!selectedDatabase && selectedSchema) {
      selectedDatabase =
        entityLookups.database(selectedSchema.database) ?? null;
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
    } else if (nextProps.entityLookups !== this.props.entityLookups) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount(): Promise<void> {
    const { activeStep } = this.state;
    const { fetchFields, fetchQuestion, selectedTableId, selectedCardId } =
      this.props;

    if (!this.isSearchLoading() && !activeStep) {
      await this.hydrateActiveStep();
    }

    if (selectedTableId != null) {
      await fetchFields(selectedTableId);
    }

    if (selectedCardId != null) {
      try {
        await fetchQuestion(selectedCardId);
      } catch {
        await this.setStateWithComputedState({ hasCardRequestFailed: true });
      }

      if (!this.isSearchLoading() && !this.state.activeStep) {
        await this.hydrateActiveStep();
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

    const { entityLookups } = this.props;
    const selectedSchemaDatabase = selectedSchema
      ? entityLookups.database(selectedSchema.database)
      : undefined;

    const invalidSchema =
      selectedDatabase &&
      selectedSchema &&
      selectedSchemaDatabase &&
      selectedSchemaDatabase.id !== selectedDatabase.id;

    const onStepMissingSchemaAndTable =
      !selectedSchema && !selectedTable && activeStep === TABLE_STEP;

    // A table whose schema hasn't loaded counts as invalid and gets cleared.
    const invalidTable =
      selectedSchema &&
      selectedTable &&
      entityLookups.tableSchema(selectedTable.id)?.id !== selectedSchema.id;

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

  hasModels = (): boolean => {
    const { availableModels, canSelectModel, loaded } = this.props;
    return loaded && canSelectModel && availableModels.includes("dataset");
  };

  hasUsableModels = (): boolean => {
    // As models are actually saved questions, nested queries must be enabled
    return this.hasModels() && this.props.hasNestedQueriesEnabled;
  };

  hasMetrics = (): boolean => {
    const { availableModels, canSelectMetric, loaded } = this.props;
    return (
      loaded &&
      canSelectMetric &&
      !this.isJoinStep() &&
      availableModels.includes("metric")
    );
  };

  hasUsableMetrics = (): boolean => {
    // As metrics are actually saved questions, nested queries must be enabled
    return this.hasMetrics() && this.props.hasNestedQueriesEnabled;
  };

  hasUsableSavedEntities = (): boolean => {
    return (
      this.hasUsableModels() ||
      this.hasSavedQuestions() ||
      this.hasUsableMetrics() ||
      this.hasLibrary()
    );
  };

  hasSavedQuestions = (): boolean => {
    const { availableModels, canSelectQuestion } = this.props;
    return canSelectQuestion && availableModels.includes("card");
  };

  hasLibrary = (): boolean => {
    const { canSelectSemanticLayer, libraryCollection } = this.props;
    const libraryContents = libraryCollection?.below ?? [];
    return (
      canSelectSemanticLayer &&
      (libraryContents.includes("table") ||
        (this.canSelectSemanticLayerMetrics() &&
          libraryContents.includes("metric")))
    );
  };

  // Library metrics follow the Metrics bucket's rules
  canSelectSemanticLayerMetrics = (): boolean =>
    !this.isJoinStep() && this.props.hasNestedQueriesEnabled;

  // With a single bucket, `skipSteps` opens it straight away, so there's no
  // bucket step to go back to
  hasDataBucketChoice = (): boolean =>
    getDataTypes({
      hasModels: this.hasModels(),
      hasTables: this.props.canSelectTable,
      hasSavedQuestions: this.hasSavedQuestions(),
      hasMetrics: this.hasMetrics(),
      hasLibrary: this.hasLibrary(),
      hasNestedQueriesEnabled: this.props.hasNestedQueriesEnabled,
    }).length > 1;

  isJoinStep(): boolean {
    return !this.props.canChangeDatabase;
  }

  getDatabases = (): DataSelectorDatabase[] => {
    const { databases } = this.state;
    const { selectedDatabaseId } = this.props;

    if (this.isJoinStep()) {
      return databases.filter((db) => db.id === selectedDatabaseId);
    }

    return databases;
  };

  // As the core pickers do (`use-get-path-from-value.ts`), a published table
  // reopens in the Library, whichever path it was picked from. A table whose
  // collection the user can't read, or that fails to load, reopens in Raw Data.
  async getLibraryCollectionIdOfTable(
    tableId: TableId,
  ): Promise<CollectionId | null> {
    try {
      const table = await this.props.fetchFields(tableId);
      return table.collection != null ? table.collection_id : null;
    } catch {
      return null;
    }
  }

  async hydrateActiveStep(): Promise<void> {
    const { selectedTableId } = this.state;
    if (
      selectedTableId != null &&
      !this.isSavedEntitySelected() &&
      this.hasLibrary()
    ) {
      const libraryCollectionId =
        await this.getLibraryCollectionIdOfTable(selectedTableId);
      if (libraryCollectionId != null) {
        await this.switchToStep(LIBRARY_STEP, {
          selectedLibraryCollectionId: libraryCollectionId,
        });
        return;
      }
    }

    if (this.isSavedEntitySelected()) {
      await this.hydrateSavedEntityStep();
    } else if (
      this.props.canSelectTable &&
      // Schema id is explicitly set when going through the New > Question/Model flow,
      // whereas we have to obtain it from the state when opening a saved question.
      (this.state.selectedSchemaId || this.state.selectedSchema?.id)
    ) {
      await this.switchToStep(TABLE_STEP);
    } else if (this.isJoinStep()) {
      const sourceCardType = match(this.props.querySourceType)
        .with("model", "question", (cardType) => cardType)
        .otherwise(() => undefined);
      // `canSelectCardType` reads the data `allLoading` waits for: it hydrates again
      if (sourceCardType && this.props.allLoading) {
        return;
      }

      if (sourceCardType && this.canSelectCardType(sourceCardType)) {
        // A join on a model or saved question that can be picked here
        await this.switchToStep(STEP_BY_CARD_TYPE[sourceCardType], {}, false);
      } else if (this.props.canSelectTable) {
        // query source is a table, or a card that can't be picked here
        await this.switchToStep(SCHEMA_STEP);
      } else {
        // A join with tables and the source's type left out: the allowed buckets
        await this.switchToStep(DATA_BUCKET_STEP);
      }
    } else {
      // A fresh pick
      await this.switchToStep(this.getFreshPickStep());
    }
  }

  async hydrateSavedEntityStep(): Promise<void> {
    // Without the card's type (its request failed), it opens as a saved question
    const cardType = this.state.hasCardRequestFailed
      ? "question"
      : this.props.selectedCardType;
    // The card's type arrives with `fetchQuestion`, and `canSelectCardType`
    // reads the data `allLoading` waits for: both hydrate again
    if (!cardType || this.props.allLoading) {
      return;
    }

    if (this.canSelectCardType(cardType)) {
      await this.switchToStep(STEP_BY_CARD_TYPE[cardType]);
      return;
    }

    // A card that can't be picked here (left out by the entity types, or
    // needing nested queries) opens where a fresh pick starts, as a table does
    // when tables are left out
    const freshPickStep = this.getFreshPickStep();
    await this.switchToStep(
      freshPickStep,
      this.getClearedStateForStep(DATA_BUCKET_STEP),
    );
  }

  // The checks the buckets use
  canSelectCardType(cardType: CardType): boolean {
    return {
      model: this.hasUsableModels(),
      question: this.hasSavedQuestions(),
      metric: this.hasUsableMetrics(),
    }[cardType];
  }

  getFreshPickStep(): DataSelectorStep {
    return this.props.canSelectTable && !this.hasUsableSavedEntities()
      ? DATABASE_STEP
      : DATA_BUCKET_STEP;
  }

  // for steps where there's a single option sometimes we want to automatically select it
  skipSteps(): void {
    const { readOnly } = this.props;
    const { activeStep } = this.state;

    if (readOnly) {
      return;
    }

    if (activeStep === DATABASE_STEP) {
      this.selectOnlyDatabase();
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
        hasMetrics: this.hasMetrics(),
        hasLibrary: this.hasLibrary(),
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

    // Back goes to the closest parent with something to pick: climb past parents
    // that aren't in `steps` or have nothing to choose (`hasStepChoice`). None, no back link.
    let step: DataSelectorStep | null = PARENT_STEP[activeStep];
    while (
      step !== null &&
      !(steps.includes(step) && this.hasStepChoice(step))
    ) {
      step = PARENT_STEP[step];
    }
    return step;
  }

  hasStepChoice(step: DataSelectorStep): boolean {
    switch (step) {
      case DATA_BUCKET_STEP:
        return this.hasDataBucketChoice();
      case DATABASE_STEP:
        return this.getDatabases().length > 1;
      case SCHEMA_STEP:
        return this.state.schemas.length > 1;
      case TABLE_STEP:
      case LIBRARY_STEP:
      case MODEL_STEP:
      case SAVED_QUESTION_STEP:
      case METRIC_STEP:
        return true;
    }
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
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
        selectedLibraryCollectionId: null,
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
    const loadersForSteps: Partial<
      Record<DataSelectorStep, () => Promise<unknown> | undefined>
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
        const {
          selectedDatabaseId,
          selectedSchemaId: chosenSchemaId,
          selectedSchema: loadedSchema,
        } = this.state;
        // A chosen schema that may not be loaded yet, or the reopened table's
        // schema
        const listedSchemaId = chosenSchemaId ?? loadedSchema?.id;
        // No schema, so no tables to list
        if (listedSchemaId == null) {
          return;
        }
        // The header and back need the schema list; a reopened table, or a
        // schema the caller set, opens here without the schema step loading it
        return Promise.all([
          selectedDatabaseId != null
            ? this.props.fetchSchemas(selectedDatabaseId)
            : undefined,
          this.props.fetchSchemaTables(listedSchemaId),
        ]);
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
    const { hasLoadedDatabases, hasLoadedDatabasesWithTables } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasLoadedDatabases;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      return hasLoadedDatabasesWithTables;
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

  onChangeDataBucket = async (
    selectedDataBucketId: DataPickerDataType,
  ): Promise<void> => {
    if (selectedDataBucketId === DATA_BUCKET.RAW_DATA) {
      await this.switchToStep(DATABASE_STEP);
      return;
    }

    if (selectedDataBucketId === DATA_BUCKET.LIBRARY) {
      await this.switchToStep(LIBRARY_STEP, {}, false);
      return;
    }

    if (selectedDataBucketId === DATA_BUCKET.MODELS) {
      await this.switchToStep(MODEL_STEP, {}, false);
    } else if (selectedDataBucketId === DATA_BUCKET.METRICS) {
      await this.switchToStep(METRIC_STEP, {}, false);
    } else {
      await this.switchToStep(SAVED_QUESTION_STEP, {}, false);
    }
  };

  selectOnlyDatabase = async (): Promise<void> => {
    const databases = this.getDatabases();
    if (databases.length === 1) {
      await this.onChangeDatabase(databases[0]);
    }
  };

  onChangeDatabase = async (database: DataSelectorDatabase): Promise<void> => {
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

  onChangeSchema = async (schema?: DataSelectorSchema): Promise<void> => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema && schema.id });
  };

  onChangeTable = async (table?: DataSelectorTable): Promise<void> => {
    if (this.props.setSourceFn && table?.id != null) {
      this.props.setSourceFn({ type: "table", id: table.id });
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

  renderActiveStep(): ReactNode {
    const { hasNestedQueriesEnabled } = this.props;
    const hasNextStep = this.getNextStep() != null;
    const hasPreviousStep = this.getPreviousStep() != null;

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
      getDatabaseSchemas: this.props.entityLookups.databaseSchemas,
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
                hasMetrics: this.hasMetrics(),
                hasLibrary: this.hasLibrary(),
                hasNestedQueriesEnabled,
              })}
              {...props}
            />
          </Box>
        );
      case DATABASE_STEP:
        return <DatabasePicker {...props} />;
      case SCHEMA_STEP:
        return <SchemaPicker {...props} />;
      case TABLE_STEP:
        return <TablePicker {...props} />;
    }

    return null;
  }

  isSavedEntitySelected = (): boolean => this.props.selectedCardId != null;

  handleSavedEntitySelect = (source: DataSource): void => {
    this.props.setSourceFn?.(source);
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
    const { activeStep, selectedTable, selectedLibraryCollectionId } =
      this.state;
    const {
      canChangeDatabase,
      libraryCollection,
      selectedDatabaseId,
      selectedCardId,
      selectedCollectionId,
    } = this.props;

    const currentDatabaseId = canChangeDatabase ? null : selectedDatabaseId;
    const selectedSource = getSelectedSource(selectedCardId, selectedTable);

    const hasNothingToPick =
      activeStep === DATA_BUCKET_STEP &&
      !this.props.canSelectTable &&
      !this.hasUsableSavedEntities();

    if (this.isSearchLoading()) {
      return <LoadingAndErrorWrapper loading />;
    }

    if (this.hasDataAccess() && !hasNothingToPick) {
      if (activeStep === LIBRARY_STEP && libraryCollection) {
        return (
          <LibraryPicker
            libraryCollection={libraryCollection}
            canSelectMetric={this.canSelectSemanticLayerMetrics()}
            databaseId={currentDatabaseId}
            selectedSource={selectedSource}
            collectionId={selectedLibraryCollectionId}
            onSelect={this.handleSavedEntitySelect}
            onBack={this.hasDataBucketChoice() ? this.previousStep : undefined}
          />
        );
      }

      const savedEntityType =
        activeStep && SAVED_ENTITY_TYPE_BY_STEP[activeStep];
      if (savedEntityType) {
        return (
          <SavedEntityPicker
            collectionId={selectedCollectionId}
            type={savedEntityType}
            selectedSource={selectedSource}
            databaseId={currentDatabaseId}
            onSelect={this.handleSavedEntitySelect}
            onBack={this.getPreviousStep() ? this.previousStep : undefined}
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

function getSelectedSource(
  selectedCardId: CardId | null | undefined,
  selectedTable: DataSelectorTable | null,
): DataSource | undefined {
  if (selectedCardId != null) {
    return { type: "card", id: selectedCardId };
  }
  if (selectedTable != null) {
    return { type: "table", id: selectedTable.id };
  }
  return undefined;
}

type ConnectOwnProps = DataSelectorOwnProps &
  SchemaFetchersProps &
  AvailableModelsInjectedProps &
  LibraryInjectedProps & {
    availableModelsResult?: AvailableModelsResult;
  };

type WithoutSchemaFetchers = Omit<ConnectOwnProps, keyof SchemaFetchersProps>;

type PublicDataSelectorProps = DataSelectorOwnProps &
  LibraryInjectedProps & { allLoading?: boolean };

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

// If there is at least one model or metric, we want to display a slightly
// different data picker view (see DATA_BUCKET step). Pre-fetches available
// models via search and exposes them as `availableModelsResult`/`loading`/`loaded` props.
function withAvailableModels(
  WrappedComponent: ComponentType<WithoutSchemaFetchers>,
): ComponentType<PublicDataSelectorProps> {
  return function DataSelectorWithAvailableModels(
    props: PublicDataSelectorProps,
  ) {
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
        allLoading={isLoading || (props.allLoading ?? false)}
      />
    );
  };
}

// Prefetches the databases list and forwards its loading state as
// `allLoading` so the picker waits for the databases (not just the models
// search) before hydrating its initial step. Without this the picker would
// briefly show only models and stream the databases in afterwards.
function withDatabasesPrefetch(
  WrappedComponent: ComponentType<PublicDataSelectorProps>,
): ComponentType<PublicDataSelectorProps> {
  return function DataSelectorWithDatabasesPrefetch(
    props: PublicDataSelectorProps,
  ) {
    const { isLoading } = useListDatabasesQuery();
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
  query?: ListDatabasesRequest,
): boolean =>
  databaseApi.endpoints.listDatabases.select(query)(state).isSuccess;

const DataSelector = withDatabasesPrefetch(
  withAvailableModels(
    withSchemaFetchers(
      connect(
        (state: State, ownProps: ConnectOwnProps): DataSelectorStateProps => {
          const response =
            databaseApi.endpoints.listDatabases.select()(state).data;
          const entityLookups = getEntityLookups(state);
          const { selectedCardId } = ownProps;
          return {
            // `availableModelsResult` exposes the search response
            // (available_models, etc.). Not to be confused with Query
            // Builder's metadata.
            availableModels:
              ownProps.availableModelsResult?.available_models ?? [],
            entityLookups,
            databases: (response?.data ?? [])
              .map(({ id }) => entityLookups.database(id))
              .filter((database) => database != null),
            hasLoadedDatabases: isListDatabasesQuerySuccess(state),
            hasLoadedDatabasesWithTables: isListDatabasesQuerySuccess(state, {
              include: "tables",
            }),
            hasDataAccess: canUserCreateQueries(state),
            hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
            selectedCardType:
              selectedCardId != null
                ? getShallowQuestions(state)[selectedCardId]?.type
                : undefined,
          };
        },
        (dispatch: Dispatch): DataSelectorDispatchProps => ({
          fetchDatabases: () =>
            runRtkEndpoint(
              undefined,
              dispatch,
              databaseApi.endpoints.listDatabases,
              { forceRefetch: false },
            ),
          fetchFields: (tableId) =>
            runRtkEndpoint(
              { id: tableId },
              dispatch,
              tableApi.endpoints.getTableQueryMetadata,
              { forceRefetch: false },
            ),
          fetchQuestion: (id) =>
            runRtkEndpoint({ id }, dispatch, cardApi.endpoints.getCard),
        }),
      )(UnconnectedDataSelector),
    ),
  ),
);

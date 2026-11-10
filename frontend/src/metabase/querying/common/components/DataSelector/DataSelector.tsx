import cx from "classnames";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { Component, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  databaseApi,
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { EmptyState } from "metabase/common/components/EmptyState";
import CS from "metabase/css/core/index.css";
import { canUserCreateQueries } from "metabase/current-user";
import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import { fetchTableMetadata } from "metabase/redux/tables";
import { Box, Popover } from "metabase/ui";
import { parseSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  DatabaseId,
  FieldId,
  ListDatabasesRequest,
  SchemaId,
  TableId,
} from "metabase-types/api";

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
import { CONTAINER_WIDTH } from "./constants";
import { type EntityLookups, getEntityLookups } from "./entity-lookups";
import type {
  DataSelectorDatabase,
  DataSelectorField,
  DataSelectorSchema,
  DataSelectorTable,
} from "./types";

// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table field (table has already been selected)
const FIELD_STEP = "FIELD";

type DataSelectorStep =
  | typeof DATABASE_STEP
  | typeof SCHEMA_STEP
  | typeof TABLE_STEP
  | typeof FIELD_STEP;

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

  selectedDatabaseId?: DatabaseId | null;
  selectedSchemaId?: SchemaId | null;
  selectedTableId?: TableId | null;
  selectedFieldId?: FieldId | null;

  databaseQuery?: ListDatabasesRequest;
  databases?: DataSelectorDatabase[];
  schemas?: DataSelectorSchema[];
  tables?: DataSelectorTable[];
  fields?: DataSelectorField[];

  setDatabaseFn?: (databaseId: DatabaseId) => void;
  setFieldFn?: (fieldId: FieldId) => void;
  setSourceTableFn?: (tableId: TableId, databaseId?: DatabaseId) => void;
  tableFilter?: (table: DataSelectorTable) => boolean;
  fieldFilter?: (field: DataSelectorField) => boolean;
  databaseIsDisabled?: (database: DataSelectorDatabase) => boolean;
  databaseDisabledTooltip?: (
    database: DataSelectorDatabase,
  ) => string | undefined;

  canChangeDatabase?: boolean;
  useOnlyAvailableDatabase?: boolean;
  useOnlyAvailableSchema?: boolean;
}

interface DataSelectorStateProps {
  entityLookups: EntityLookups;
  databases: DataSelectorDatabase[];
  hasLoadedDatabases: boolean;
  hasLoadedDatabasesWithTables: boolean;
  hasDataAccess: boolean;
}

interface DataSelectorDispatchProps {
  fetchDatabases: (databaseQuery?: ListDatabasesRequest) => Promise<unknown>;
  fetchFields: (tableId: TableId) => Promise<unknown>;
}

interface SchemaFetchersProps {
  fetchSchemas: (databaseId: DatabaseId) => Promise<unknown>;
  fetchSchemaTables: (schemaId: SchemaId) => Promise<unknown>;
}

type DataSelectorProps = DataSelectorOwnProps &
  DataSelectorStateProps &
  DataSelectorDispatchProps &
  SchemaFetchersProps;

interface ComputedDataSelectorState {
  databases: DataSelectorDatabase[];
  selectedDatabase: DataSelectorDatabase | null;
  schemas: DataSelectorSchema[];
  selectedSchema: DataSelectorSchema | null;
  tables: DataSelectorTable[];
  selectedTable: DataSelectorTable | null;
  fields: DataSelectorField[];
  selectedField: DataSelectorField | null;
}

interface DataSelectorState extends ComputedDataSelectorState {
  activeStep: DataSelectorStep | null;
  isLoading: boolean;
  isError: boolean;
  isPopoverOpen: boolean;
  selectedDatabaseId: DatabaseId | null;
  selectedSchemaId: SchemaId | null;
  selectedTableId: TableId | null;
  selectedFieldId: FieldId | null;
}

type SelectedIdsState = Pick<
  DataSelectorState,
  | "selectedDatabaseId"
  | "selectedSchemaId"
  | "selectedTableId"
  | "selectedFieldId"
>;

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
    canChangeDatabase: true,
    hasTriggerExpandControl: true,
    isPopover: true,
    isMantine: false,
  };

  constructor(props: DataSelectorProps) {
    super(props);

    const state: SelectedIdsState & {
      isPopoverOpen: boolean;
    } = {
      selectedDatabaseId: props.selectedDatabaseId ?? null,
      selectedSchemaId: props.selectedSchemaId ?? null,
      selectedTableId: props.selectedTableId ?? null,
      selectedFieldId: props.selectedFieldId ?? null,
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

  // computes selected entities (`selectedDatabase`, etc) and options
  // (`databases`, etc) from props (`entityLookups`, `databases`, etc) and state
  // (`selectedDatabaseId`, etc)
  //
  // NOTE: this is complicated because we allow you to:
  // 1. pass in databases/schemas/tables/fields as props
  // 2. pull them from the currently selected "parent" entity
  // 3. pull them out of the store
  //
  // We also want to recompute the selected objects from their selected ID
  // each time rather than storing the object itself in case new metadata is
  // asynchronously loaded
  //
  _getComputedState(
    props: DataSelectorProps,
    state: SelectedIdsState,
  ): ComputedDataSelectorState {
    const { entityLookups, tableFilter, fieldFilter } = props;
    const {
      selectedDatabaseId,
      selectedSchemaId,
      selectedTableId,
      selectedFieldId,
    } = state;

    let { databases, schemas, tables, fields } = props;
    let selectedDatabase: DataSelectorDatabase | null = null;
    let selectedSchema: DataSelectorSchema | null = null;
    let selectedTable: DataSelectorTable | null = null;
    let selectedField: DataSelectorField | null = null;

    const getDatabase = (id: DatabaseId) =>
      _.findWhere(databases, { id }) || entityLookups.database(id);
    const getSchema = (id: SchemaId) =>
      _.findWhere(schemas ?? [], { id }) || entityLookups.schema(id);
    const getTable = (id: TableId) =>
      _.findWhere(tables ?? [], { id }) || entityLookups.table(id);
    const getField = (id: FieldId) =>
      _.findWhere(fields ?? [], { id }) || entityLookups.field(id);

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

    const deriveFromTable = (table: DataSelectorTable | null) => {
      if (!fields && table) {
        fields = entityLookups.tableFields(table.id);
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
      selectedTable = entityLookups.table(selectedField.table_id) ?? null;
      deriveFromTable(selectedTable);
    }
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
      this.setState(
        (prevState) => ({ ...prevState, ...newState, ...computedState }),
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
    } else if (nextProps.entityLookups !== this.props.entityLookups) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount() {
    const { fetchFields, selectedTableId } = this.props;

    if (!this.state.activeStep) {
      await this.hydrateActiveStep();
    }

    if (selectedTableId != null) {
      await fetchFields(selectedTableId);
    }
  }

  async componentDidUpdate() {
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
      !selectedSchema &&
      !selectedTable &&
      (activeStep === TABLE_STEP || activeStep === FIELD_STEP);

    const onStepMissingTable = !selectedTable && activeStep === FIELD_STEP;

    const invalidTable =
      selectedSchema &&
      selectedTable &&
      entityLookups.tableSchema(selectedTable.id)?.id !== selectedSchema.id;

    const invalidField =
      selectedTable &&
      selectedField &&
      selectedField.table_id !== selectedTable.id;

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

  getDatabases = () => this.state.databases;

  async hydrateActiveStep() {
    const { steps } = this.props;
    if (this.state.selectedTableId && steps.includes(FIELD_STEP)) {
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
      if (enabledDatabases.length === 1) {
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
    const index = steps.findIndex((step) => step === this.state.activeStep);
    return index < steps.length - 1 ? steps[index + 1] : null;
  }

  getPreviousStep(): DataSelectorStep | null {
    const { steps } = this.props;
    const { activeStep } = this.state;
    if (activeStep === null) {
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
    if (step === DATABASE_STEP) {
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
      [DATABASE_STEP]: () => {
        return this.props.fetchDatabases(this.props.databaseQuery);
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
    const { hasLoadedDatabases, hasLoadedDatabasesWithTables } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasLoadedDatabases;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      return hasLoadedDatabasesWithTables;
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

  onChangeDatabase = async (database: DataSelectorDatabase) => {
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

  onChangeSchema = async (schema?: DataSelectorSchema) => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema?.id ?? null });
  };

  onChangeTable = async (table?: DataSelectorTable) => {
    if (this.props.setSourceTableFn && table?.id != null) {
      this.props.setSourceTableFn(table.id, table.db_id);
    }
    await this.nextStep({ selectedTableId: table?.id ?? null });
  };

  onChangeField = async (field?: DataSelectorField) => {
    const fieldId = typeof field?.id === "number" ? field.id : null;
    if (this.props.setFieldFn && fieldId != null) {
      this.props.setFieldFn(fieldId);
    }
    await this.nextStep({ selectedFieldId: fieldId });
  };

  getTriggerElement = () => {
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

    // Only the field trigger reads this, to tell a schema-qualified table name
    // from a plain one.
    const hasMultipleSchemas =
      selectedField != null &&
      selectedDatabase != null &&
      _.uniq(
        this.props.entityLookups.databaseTables(selectedDatabase.id),
        (table) => table.schema_name,
      ).length > 1;

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
            hasMultipleSchemas={hasMultipleSchemas}
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

  renderActiveStep() {
    const { combineDatabaseSchemaSteps } = this.props;
    const hasNextStep = this.getNextStep() != null;
    const hasPreviousStep = this.getPreviousStep() != null;

    const stepProps = {
      ...this.state,
      databases: this.getDatabases(),
      selectedDatabase: this.state.selectedDatabase ?? undefined,
      selectedSchema: this.state.selectedSchema ?? undefined,
      selectedTable: this.state.selectedTable ?? undefined,
      selectedField: this.state.selectedField ?? undefined,
      selectedSchemaId: this.state.selectedSchemaId ?? undefined,

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
      getDatabaseSchemas: this.props.entityLookups.databaseSchemas,
      getFieldDisplayName: this.props.entityLookups.fieldName,
    };

    switch (this.state.activeStep) {
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DataSelectorDatabaseSchemaPicker {...stepProps} />
        ) : (
          <DataSelectorDatabasePicker {...stepProps} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DataSelectorDatabaseSchemaPicker {...stepProps} />
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
    if (this.hasDataAccess()) {
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

type ConnectOwnProps = DataSelectorOwnProps & SchemaFetchersProps;

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
  const entityLookups = getEntityLookups(state);
  return {
    entityLookups,
    databases:
      ownProps.databases ||
      queriedDatabases
        ?.map(({ id }) => entityLookups.database(id))
        .filter((database) => database != null) ||
      [],
    hasLoadedDatabases: isListDatabasesQuerySuccess(state, databaseQuery),
    hasLoadedDatabasesWithTables: isListDatabasesQuerySuccess(state, {
      include: "tables",
      "can-query": true,
    }),
    hasDataAccess: canUserCreateQueries(state),
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
});

const DataSelector = withDatabaseList(
  withSchemaFetchers(
    connect(mapStateToProps, mapDispatchToProps)(UnconnectedDataSelector),
  ),
);

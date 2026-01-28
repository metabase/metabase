import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { popover } from "./e2e-ui-elements-helpers";

export const DataModel = {
  visit,
  visitDataStudio,
  visitDataStudioSegments,
  visitDataStudioMeasures,
  get: getDataModel,
  TablePicker: {
    get: getTablePicker,
    getDatabase: getTablePickerDatabase,
    getDatabaseToggle: getTablePickerDatabaseToggle,
    getDatabaseCheckbox,
    getDatabases: getTablePickerDatabases,
    getSchemas: getTablePickerSchemas,
    getSchema: getTablePickerSchema,
    getSchemaToggle: getTablePickerSchemaToggle,
    getSchemaCheckbox,
    getTables: getTablePickerTables,
    getTable: getTablePickerTable,
    getSearchInput: getTablePickerSearchInput,
    getFilterForm: getTablePickerFilter,
    openFilterPopover,
    selectFilterOption,
    applyFilters,
  },
  TableSection: {
    get: getTableSection,
    getNameInput: getTableNameInput,
    getDescriptionInput: getTableDescriptionInput,
    getQueryBuilderLink: getTableQueryBuilderLink,
    getSortButton: getTableSortButton,
    getSortDoneButton: getTableSortDoneButton,
    getSortOrderInput: getTableSortOrderInput,
    getSyncOptionsButton: getTableSyncOptionsButton,
    getField: getTableSectionField,
    getFieldNameInput: getTableSectionFieldNameInput,
    getFieldDescriptionInput: getTableSectionFieldDescriptionInput,
    getSortableField: getTableSectionSortableField,
    getSortableFields: getTableSectionSortableFields,
    getVisibilityTypeInput: getTableSectionVisibilityTypeInput,
    clickField: clickTableSectionField,
    getCloseButton: getTableSectionCloseButton,
  },
  FieldSection: {
    get: getFieldSection,
    getNameInput: getFieldNameInput,
    getRawName: getRawFieldName,
    getDescriptionInput: getFieldDescriptionInput,
    getPreviewButton: getFieldPreviewButton,
    getFieldValuesButton: getFieldValuesButton,
    getDataType: getFieldDataType,
    getCoercionToggle: getFieldCoercionToggle,
    getCoercionInput: getFieldCoercionInput,
    getSemanticTypeInput: getFieldSemanticTypeInput,
    getSemanticTypeCurrencyInput: getFieldSemanticTypeCurrencyInput,
    getSemanticTypeFkTarget: getFieldSemanticTypeFkTargetInput,
    getVisibilityInput: getFieldVisibilityInput,
    getFilteringInput: getFieldFilteringInput,
    getDisplayValuesInput: getFieldDisplayValuesInput,
    getDisplayValuesFkTargetInput: getFieldDisplayValuesFkTargetInput,
    getUnfoldJsonInput: getFieldUnfoldJsonInput,
    getStyleInput: getFieldStyleInput,
    getMiniBarChartToggle: getFieldMiniBarChartToggle,
    getMultiplyByNumberInput: getFieldMultiplyByNumberInput,
    getPrefixInput: getFieldPrefixInput,
    getSuffixInput: getFieldSuffixInput,
    getCloseButton: getFieldSectionCloseButton,
  },
  PreviewSection: {
    get: getPreviewSection,
    getPreviewTypeInput: getPreviewTabsInput,
  },
  SegmentList: {
    get: getSegmentList,
    getEmptyState: getSegmentListEmptyState,
    getNewSegmentLink: getSegmentListNewLink,
    getSegment: getSegmentListItem,
    getSegments: getSegmentListItems,
  },
  SegmentEditor: {
    get: getSegmentEditor,
    getNameInput: getSegmentEditorNameInput,
    getDescriptionInput: getSegmentEditorDescriptionInput,
    getFilterPlaceholder: getSegmentEditorFilterPlaceholder,
    getPreviewLink: getSegmentEditorPreviewLink,
    getSaveButton: getSegmentEditorSaveButton,
    getCancelButton: getSegmentEditorCancelButton,
    getActionsButton: getSegmentEditorActionsButton,
    getBreadcrumb: getSegmentEditorBreadcrumb,
    getDefinitionTab: getSegmentEditorDefinitionTab,
    getRevisionHistoryTab: getSegmentEditorRevisionHistoryTab,
    getDependenciesTab: getSegmentEditorDependenciesTab,
  },
  SegmentRevisionHistory: {
    get: getSegmentRevisionHistory,
  },
  MeasureList: {
    get: getMeasureList,
    getEmptyState: getMeasureListEmptyState,
    getNewMeasureLink: getMeasureListNewLink,
    getMeasure: getMeasureListItem,
    getMeasures: getMeasureListItems,
  },
  MeasureEditor: {
    get: getMeasureEditor,
    getNameInput: getMeasureEditorNameInput,
    getDescriptionInput: getMeasureEditorDescriptionInput,
    getAggregationPlaceholder: getMeasureEditorAggregationPlaceholder,
    getPreviewLink: getMeasureEditorPreviewLink,
    getSaveButton: getMeasureEditorSaveButton,
    getCancelButton: getMeasureEditorCancelButton,
    getActionsButton: getMeasureEditorActionsButton,
    getBreadcrumb: getMeasureEditorBreadcrumb,
    getDefinitionTab: getMeasureEditorDefinitionTab,
    getRevisionHistoryTab: getMeasureEditorRevisionHistoryTab,
    getDependenciesTab: getMeasureEditorDependenciesTab,
  },
  MeasureRevisionHistory: {
    get: getMeasureRevisionHistory,
  },
};

const DEFAULT_BASE_PATH = "/admin/datamodel";

function visit({
  databaseId,
  schemaId,
  tableId,
  fieldId,
  skipWaiting = false,
  basePath,
}: {
  databaseId?: DatabaseId;
  fieldId?: FieldId;
  schemaId?: SchemaId;
  tableId?: TableId;
  skipWaiting?: boolean;
  basePath?: string;
} = {}) {
  const normalizedBasePath = getNormalizedBasePath(basePath);
  cy.intercept("GET", "/api/database").as("datamodel/visit/databases");
  cy.intercept("GET", "/api/database/*").as("datamodel/visit/database");
  cy.intercept("GET", "/api/table/*/query_metadata*").as(
    "datamodel/visit/metadata",
  );
  cy.intercept("GET", "/api/database/*/schemas?*").as(
    "datamodel/visit/schemas",
  );
  cy.intercept("GET", "/api/database/*/schema/*").as("datamodel/visit/schema");

  if (
    databaseId != null &&
    schemaId != null &&
    tableId != null &&
    fieldId != null
  ) {
    cy.visit(
      `${normalizedBasePath}/database/${databaseId}/schema/${schemaId}/table/${tableId}/field/${fieldId}`,
    );

    if (!skipWaiting) {
      cy.wait([
        "@datamodel/visit/databases",
        "@datamodel/visit/database",
        "@datamodel/visit/schemas",
        "@datamodel/visit/schema",
        "@datamodel/visit/metadata",
      ]);
    }

    return;
  }

  if (databaseId != null && schemaId != null && tableId != null) {
    cy.visit(
      `${normalizedBasePath}/database/${databaseId}/schema/${schemaId}/table/${tableId}`,
    );

    if (!skipWaiting) {
      cy.wait([
        "@datamodel/visit/databases",
        "@datamodel/visit/schemas",
        "@datamodel/visit/schema",
        "@datamodel/visit/metadata",
      ]);
    }

    return;
  }

  if (databaseId != null && schemaId != null) {
    cy.visit(`${normalizedBasePath}/database/${databaseId}/schema/${schemaId}`);

    if (!skipWaiting) {
      cy.wait([
        "@datamodel/visit/databases",
        "@datamodel/visit/schemas",
        "@datamodel/visit/schema",
      ]);
    }
    return;
  }

  if (databaseId != null) {
    cy.visit(`${normalizedBasePath}/database/${databaseId}`);

    if (!skipWaiting) {
      cy.wait([
        "@datamodel/visit/databases",
        "@datamodel/visit/schemas",
        "@datamodel/visit/schema",
      ]);
    }

    return;
  }

  cy.visit(normalizedBasePath);
  cy.wait(["@datamodel/visit/databases"]);
}

function visitDataStudio(options?: Parameters<typeof visit>[0]) {
  visit({ ...options, basePath: "/data-studio/data" });
}

function getNormalizedBasePath(path?: string) {
  const resolvedPath = path ?? DEFAULT_BASE_PATH;
  if (resolvedPath.length === 0) {
    return DEFAULT_BASE_PATH;
  }

  return resolvedPath.endsWith("/")
    ? resolvedPath.slice(0, resolvedPath.length - 1)
    : resolvedPath;
}

function getDataModel() {
  return cy.findByTestId("data-model");
}

/** table picker helpers */

function getTablePicker() {
  return cy.findByTestId("table-picker");
}

function getTablePickerDatabase(name: string) {
  return cy
    .findAllByTestId("tree-item")
    .filter('[data-type="database"]')
    .filter(`:contains("${name}")`);
}

function getTablePickerDatabaseToggle(name: string) {
  return getTablePickerDatabase(name).find("[aria-expanded]");
}

function getTablePickerDatabases() {
  return cy.findAllByTestId("tree-item").filter('[data-type="database"]');
}

function getTablePickerSchema(name: string) {
  return cy
    .findAllByTestId("tree-item")
    .filter('[data-type="schema"]')
    .filter(`:contains("${name}")`);
}

function getTablePickerSchemaToggle(name: string) {
  return getTablePickerSchema(name).find("[aria-expanded]");
}

function getTablePickerSchemas() {
  return cy.findAllByTestId("tree-item").filter('[data-type="schema"]');
}

function getTablePickerTable(name: string) {
  return cy
    .findAllByTestId("tree-item")
    .filter('[data-type="table"]')
    .filter(`:contains("${name}")`);
}

function getTablePickerSearchInput() {
  return cy.findByPlaceholderText("Search tables");
}

function getTablePickerFilter() {
  return cy.findByTestId("table-picker-filter");
}

function getTablePickerTables() {
  return cy.findAllByTestId("tree-item").filter('[data-type="table"]');
}

/** table section helpers */

function getTableSection() {
  return cy.findByTestId("table-section");
}

function getTableSectionHeader() {
  return cy.findByTestId("table-section-header");
}

function getTableNameInput() {
  return getTableSection().findByPlaceholderText("Give this table a name");
}

function getTableQueryBuilderLink() {
  return getTableSection().findByLabelText("Go to this table");
}

function getTableDescriptionInput() {
  return getTableSection().findByPlaceholderText(
    "Give this table a description",
  );
}

function getTableSortButton() {
  return getTableSection().findByRole("button", { name: "Sorting" });
}

function getTableSortDoneButton() {
  return getTableSection().findByRole("button", { name: "Done" });
}

function getTableSortOrderInput() {
  return getTableSection().findByRole("radiogroup", { name: "Column order" });
}

function getTableSyncOptionsButton() {
  return getTableSection().findByRole("button", { name: /Sync/ });
}

function getTableSectionField(name: string) {
  return getTableSection().findByRole("listitem", { name });
}

function getTableSectionSortableField(name: string) {
  return getTableSection().findByRole("listitem", { name });
}

function getTableSectionSortableFields() {
  return getTableSection().findAllByRole("listitem");
}

function getTableSectionVisibilityTypeInput() {
  return getTableSection().findByRole("textbox", { name: "Visibility type" });
}

function getTableSectionFieldNameInput(name: string) {
  return getTableSectionField(name).findByPlaceholderText(
    "Give this field a name",
  );
}

function getTableSectionFieldDescriptionInput(name: string) {
  return getTableSectionField(name).findByPlaceholderText("No description yet");
}

function clickTableSectionField(name: string) {
  // clicks the icon specifically to avoid issues with clicking the name or description inputs
  return getTableSectionField(name).findByRole("img").scrollIntoView().click();
}

function getTableSectionCloseButton() {
  return getTableSectionHeader().findByRole("link", { name: /close/ });
}

/** field section helpers */

function getFieldSection() {
  return cy.findByTestId("field-section");
}

function getFieldSectioHeader() {
  return cy.findByTestId("field-section-header");
}

function getFieldNameInput() {
  return getFieldSection().findByPlaceholderText("Give this field a name");
}

function getFieldDescriptionInput() {
  return getFieldSection().findByPlaceholderText(
    "Give this field a description",
  );
}

function getFieldPreviewButton() {
  return getFieldSection().button(/Preview/);
}

function getFieldValuesButton() {
  return getFieldSection().button(/Field values/);
}

function getRawFieldName() {
  return getFieldSection().findByLabelText("Field name");
}

function getFieldDataType() {
  return getFieldSection().findByLabelText("Data type");
}

function getFieldCoercionToggle() {
  return getFieldSection().findByLabelText("Cast to a specific data type");
}

function getFieldCoercionInput() {
  return getFieldSection().findByPlaceholderText("Select data type");
}

function getFieldSemanticTypeInput() {
  return getFieldSection().findByPlaceholderText("Select a semantic type");
}

function getFieldSemanticTypeCurrencyInput() {
  return getFieldSection().findByPlaceholderText("Select a currency type");
}

function getFieldSemanticTypeFkTargetInput() {
  return getFieldSection().findByLabelText("Foreign key target");
}

function getFieldVisibilityInput() {
  return getFieldSection().findByPlaceholderText("Select a field visibility");
}

function getFieldFilteringInput() {
  return getFieldSection().findByPlaceholderText("Select field filtering");
}

function getFieldDisplayValuesInput() {
  return getFieldSection().findByPlaceholderText("Select display values");
}

function getFieldDisplayValuesFkTargetInput() {
  return getFieldSection().findByPlaceholderText("Choose a field");
}

function getFieldUnfoldJsonInput() {
  return getFieldSection().findByPlaceholderText(
    "Select whether to unfold JSON",
  );
}

function getFieldMiniBarChartToggle() {
  return getFieldSection().findByLabelText("Show a mini bar chart");
}

function getFieldMultiplyByNumberInput() {
  return getFieldSection().findByLabelText("Multiply by a number");
}

function getFieldStyleInput() {
  return getFieldSection().findByLabelText("Style");
}

function getFieldPrefixInput() {
  return getFieldSection().findByTestId("prefix");
}

function getFieldSuffixInput() {
  return getFieldSection().findByTestId("suffix");
}

function getFieldSectionCloseButton() {
  return getFieldSectioHeader().findByRole("link", { name: /close/ });
}

/** preview section helpers */

function getPreviewSection() {
  return cy.findByTestId("preview-section");
}

function getPreviewTabsInput() {
  return getPreviewSection().findByLabelText("Preview type");
}

/** segment list helpers */

function visitDataStudioSegments(options: {
  databaseId: DatabaseId;
  schemaId: SchemaId;
  tableId: TableId;
}) {
  cy.intercept("GET", "/api/table/*/query_metadata*").as(
    "datamodel/visit/metadata",
  );
  cy.visit(
    `/data-studio/data/database/${options.databaseId}/schema/${options.schemaId}/table/${options.tableId}/segments`,
  );
  cy.wait("@datamodel/visit/metadata");
}

function getSegmentList() {
  return cy.findByTestId("table-segments-page");
}

function getSegmentListEmptyState() {
  return getSegmentList().findByText("No segments yet");
}

function getSegmentListNewLink() {
  return getSegmentList().findByRole("link", { name: /New segment/i });
}

function getSegmentListItem(name: string) {
  return getSegmentList().findByRole("listitem", { name });
}

function getSegmentListItems() {
  return getSegmentList().findAllByRole("listitem");
}

/** segment editor helpers */

function getSegmentEditor() {
  return cy.get(
    "[data-testid='new-segment-page'], [data-testid='segment-detail-page']",
  );
}

function getSegmentEditorNameInput() {
  return getSegmentEditor().findByPlaceholderText("New segment");
}

function getSegmentEditorDescriptionInput() {
  return getSegmentEditor().findByLabelText("Give it a description");
}

function getSegmentEditorFilterPlaceholder() {
  return getSegmentEditor().findByText("Add filters to narrow your answer");
}

function getSegmentEditorPreviewLink() {
  return getSegmentEditor().findByRole("link", { name: /Preview/i });
}

function getSegmentEditorSaveButton() {
  return getSegmentEditor().button("Save");
}

function getSegmentEditorCancelButton() {
  return getSegmentEditor().button("Cancel");
}

function getSegmentEditorActionsButton() {
  return cy.findByLabelText("Segment actions");
}

function getSegmentEditorBreadcrumb(tableName: string) {
  return cy.findByText(tableName);
}

function getSegmentEditorDefinitionTab() {
  return cy.findByTestId("segment-pane-header").findByText("Definition");
}

function getSegmentEditorRevisionHistoryTab() {
  return cy.findByTestId("segment-pane-header").findByText("Revision history");
}

function getSegmentEditorDependenciesTab() {
  return cy.findByTestId("segment-pane-header").findByText("Dependencies");
}

function getSegmentRevisionHistory() {
  return cy.findByTestId("segment-revision-history-page");
}

/** measure list helpers */

function visitDataStudioMeasures(options: {
  databaseId: DatabaseId;
  schemaId: SchemaId;
  tableId: TableId;
}) {
  cy.intercept("GET", "/api/table/*/query_metadata*").as(
    "datamodel/visit/metadata",
  );
  cy.visit(
    `/data-studio/data/database/${options.databaseId}/schema/${options.schemaId}/table/${options.tableId}/measures`,
  );
  cy.wait("@datamodel/visit/metadata");
}

function getMeasureList() {
  return cy.findByTestId("table-measures-page");
}

function getMeasureListEmptyState() {
  return getMeasureList().findByText("No measures yet");
}

function getMeasureListNewLink() {
  return getMeasureList().findByRole("link", { name: /New measure/i });
}

function getMeasureListItem(name: string) {
  return getMeasureList().findByRole("listitem", { name });
}

function getMeasureListItems() {
  return getMeasureList().findAllByRole("listitem");
}

/** measure editor helpers */

function getMeasureEditor() {
  return cy.get(
    "[data-testid='new-measure-page'], [data-testid='measure-detail-page']",
  );
}

function getMeasureEditorNameInput() {
  return getMeasureEditor().findByPlaceholderText("New measure");
}

function getMeasureEditorDescriptionInput() {
  return getMeasureEditor().findByLabelText("Give it a description");
}

function getMeasureEditorAggregationPlaceholder() {
  return getMeasureEditor().findByText("Pick an aggregation function");
}

function getMeasureEditorPreviewLink() {
  return getMeasureEditor().findByRole("link", { name: /Preview/i });
}

function getMeasureEditorSaveButton() {
  return getMeasureEditor().button("Save");
}

function getMeasureEditorCancelButton() {
  return getMeasureEditor().button("Cancel");
}

function getMeasureEditorActionsButton() {
  return cy.findByLabelText("Measure actions");
}

function getMeasureEditorBreadcrumb(tableName: string) {
  return cy.findByText(tableName);
}

function getMeasureEditorDefinitionTab() {
  return cy.findByTestId("measure-pane-header").findByText("Definition");
}

function getMeasureEditorRevisionHistoryTab() {
  return cy.findByTestId("measure-pane-header").findByText("Revision history");
}

function getMeasureEditorDependenciesTab() {
  return cy.findByTestId("measure-pane-header").findByText("Dependencies");
}

function getMeasureRevisionHistory() {
  return cy.findByTestId("measure-revision-history-page");
}

export function openFilterPopover() {
  cy.findByRole("button", { name: "Filter" }).click();
  popover();
}

export function selectFilterOption(fieldLabel: string, optionLabel: string) {
  cy.findByRole("textbox", { name: fieldLabel }).click();
  popover().contains(optionLabel).click();
}

export function applyFilters() {
  cy.findByRole("button", { name: "Apply" }).click();
  cy.wait("@listTables");
}

export function getDatabaseCheckbox(databaseName: string) {
  return getTablePickerDatabase(databaseName).find('input[type="checkbox"]');
}

export function getSchemaCheckbox(schemaName: string) {
  return getTablePickerSchema(schemaName).find('input[type="checkbox"]');
}

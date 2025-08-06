import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";

export const DataModel = {
  visit,
  get: getDataModel,
  TablePicker: {
    get: getTablePicker,
    getDatabase: getTablePickerDatabase,
    getDatabases: getTablePickerDatabases,
    getSchemas: getTablePickerSchemas,
    getSchema: getTablePickerSchema,
    getTables: getTablePickerTables,
    getTable: getTablePickerTable,
    getSearchInput: getTablePickerSearchInput,
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
    clickField: clickTableSectionField,
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
  },
  PreviewSection: {
    get: getPreviewSection,
    getPreviewTypeInput: getPreviewTabsInput,
  },
};

function visit({
  databaseId,
  schemaId,
  tableId,
  fieldId,
  skipWaiting = false,
}: {
  databaseId?: DatabaseId;
  fieldId?: FieldId;
  schemaId?: SchemaId;
  tableId?: TableId;
  skipWaiting?: boolean;
} = {}) {
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
      `/admin/datamodel/database/${databaseId}/schema/${schemaId}/table/${tableId}/field/${fieldId}`,
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
      `/admin/datamodel/database/${databaseId}/schema/${schemaId}/table/${tableId}`,
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
    cy.visit(`/admin/datamodel/database/${databaseId}/schema/${schemaId}`);

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
    cy.visit(`/admin/datamodel/database/${databaseId}`);

    if (!skipWaiting) {
      cy.wait([
        "@datamodel/visit/databases",
        "@datamodel/visit/schemas",
        "@datamodel/visit/schema",
      ]);
    }

    return;
  }

  cy.visit("/admin/datamodel");
  cy.wait(["@datamodel/visit/databases"]);
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

function getTablePickerDatabases() {
  return cy.findAllByTestId("tree-item").filter('[data-type="database"]');
}

function getTablePickerSchema(name: string) {
  return cy
    .findAllByTestId("tree-item")
    .filter('[data-type="schema"]')
    .filter(`:contains("${name}")`);
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

function getTablePickerTables() {
  return cy.findAllByTestId("tree-item").filter('[data-type="table"]');
}

/** table section helpers */

function getTableSection() {
  return cy.findByTestId("table-section");
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
  return getTableSection().button(/Sorting/);
}

function getTableSortDoneButton() {
  return getTableSection().button(/Done/);
}

function getTableSortOrderInput() {
  return getTableSection().findByLabelText("Column order");
}

function getTableSyncOptionsButton() {
  return getTableSection().button(/Sync options/);
}

function getTableSectionField(name: string) {
  return getTableSection().findByLabelText(name);
}

function getTableSectionSortableField(name: string) {
  return getTableSection().findByLabelText(name);
}

function getTableSectionSortableFields() {
  return getTableSection().findAllByRole("listitem");
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

/** field section helpers */

function getFieldSection() {
  return cy.findByTestId("field-section");
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

/** preview section helpers */

function getPreviewSection() {
  return cy.findByTestId("preview-section");
}

function getPreviewTabsInput() {
  return getPreviewSection().findByLabelText("Preview type");
}

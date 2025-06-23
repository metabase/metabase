import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";

export const DataModel = {
  visit,
  TablePicker: {
    getTable: getTablePickerTable,
    getTables: getTablePickerTables,
  },
  TableSection: {
    get: getTableSection,
    getNameInput: getTableNameInput,
    getDescriptionInput: getTableDescriptionInput,
    getSortButton: getTableSortButton,
    getSortOrderInput: getTableSortOrderInput,
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
    getDescriptionInput: getFieldDescriptionInput,
    getDataTypeInput: getFieldDataTypeInput,
    getCoercionToggle: getFieldCoercionToggle,
    getCoercionInput: getFieldCoercionInput,
    getSemanticTypeInput: getFieldSemanticTypeInput,
    getSemanticTypeCurrencyInput: getFieldSemanticTypeCurrencyInput,
    getSemanticTypeFkTarget: getFieldSemanticTypeFkTargetInput,
    getVisibilityInput: getFieldVisibilityInput,
    getFilteringInput: getFieldFilteringInput,
    getDisplayValuesInput: getFieldDisplayValuesInput,
    getDisplayValuesFkTargetInput: getFieldDisplayValuesFkTargetInput,
    getStyleInput: getFieldStyleInput,
    getPrefixInput: getFieldPrefixInput,
    getSuffixInput: getFieldSuffixInput,
  },
};

function visit({
  databaseId,
  schemaId,
  tableId,
  fieldId,
}: {
  databaseId?: DatabaseId;
  fieldId?: FieldId;
  schemaId?: SchemaId;
  tableId?: TableId;
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
      `/admin/datamodel/database/${databaseId}/schema/${encodeURIComponent(schemaId)}/table/${tableId}/field/${fieldId}`,
    );

    cy.wait([
      "@datamodel/visit/databases",
      "@datamodel/visit/database",
      "@datamodel/visit/schemas",
      "@datamodel/visit/schema",
      "@datamodel/visit/metadata",
    ]);
    return;
  }

  if (databaseId != null && schemaId != null && tableId != null) {
    cy.visit(
      `/admin/datamodel/database/${databaseId}/schema/${encodeURIComponent(schemaId)}/table/${tableId}`,
    );
    cy.wait([
      "@datamodel/visit/databases",
      "@datamodel/visit/schemas",
      "@datamodel/visit/schema",
      "@datamodel/visit/metadata",
    ]);
    return;
  }

  if (databaseId != null && schemaId != null) {
    cy.visit(
      `/admin/datamodel/database/${databaseId}/schema/${encodeURIComponent(schemaId)}`,
    );
    cy.wait([
      "@datamodel/visit/databases",
      "@datamodel/visit/schemas",
      "@datamodel/visit/schema",
    ]);
    return;
  }

  if (databaseId != null) {
    cy.visit(`/admin/datamodel/database/${databaseId}`);
    cy.wait([
      "@datamodel/visit/databases",
      "@datamodel/visit/schemas",
      "@datamodel/visit/schema",
    ]);
    return;
  }

  cy.visit("/admin/datamodel");
  cy.wait(["@datamodel/visit/databases"]);
}

/** table picker helpers */

function getTablePickerTable(name: string) {
  return cy.findAllByTestId("tree-item").filter(`:contains("${name}")`);
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

function getTableDescriptionInput() {
  return getTableSection().findByPlaceholderText(
    "Give this table a description",
  );
}

function getTableSortButton() {
  return getTableSection().button(/Sorting/);
}

function getTableSortOrderInput() {
  return getTableSection().findByLabelText("Column order");
}

function getTableSectionField(name: string) {
  return getTableSection().get(`a[aria-label="${name}"]`);
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

function getFieldDataTypeInput() {
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
  return getFieldSection().findByPlaceholderText("Select a target");
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

function getFieldStyleInput() {
  return getFieldSection().findByLabelText("Style");
}

function getFieldPrefixInput() {
  return getFieldSection().findByTestId("prefix");
}

function getFieldSuffixInput() {
  return getFieldSection().findByTestId("suffix");
}

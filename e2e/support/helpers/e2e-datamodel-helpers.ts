import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";

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
  cy.intercept("GET", "/api/database/*/schemas?include_hidden=true").as(
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

function getTablePickerTable(name: string) {
  return cy.findAllByTestId("tree-item").filter(`:contains("${name}")`);
}

function getTableSection() {
  return cy.findByTestId("table-section");
}

function getTableSectionField(name: string) {
  return getTableSection().get(`a[aria-label="${name}"]`);
}

function clickTableSectionField(name: string) {
  // clicks the icon specifically to avoid issues with clicking the name or description inputs
  return getTableSectionField(name).findByRole("img").scrollIntoView().click();
}

function getFieldSection() {
  return cy.findByTestId("field-section");
}

export const DataModel = {
  visit,
  TablePicker: {
    getTable: getTablePickerTable,
  },
  TableSection: {
    get: getTableSection,
    getField: getTableSectionField,
    clickField: clickTableSectionField,
  },
  FieldSection: {
    get: getFieldSection,
  },
};

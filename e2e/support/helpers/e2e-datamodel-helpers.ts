import type {
  DatabaseId,
  FieldId,
  SchemaName,
  TableId,
} from "metabase-types/api";

// TODO: add fetchmetadata wait
function visit({
  databaseId,
  schemaName,
  tableId,
  fieldId,
}: {
  databaseId?: DatabaseId;
  fieldId?: FieldId;
  schemaName?: SchemaName;
  tableId?: TableId;
} = {}) {
  if (
    databaseId != null &&
    schemaName != null &&
    tableId != null &&
    fieldId != null
  ) {
    cy.visit(
      `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaName)}/table/${tableId}/field/${fieldId}`,
    );
    return;
  }

  if (databaseId != null && schemaName != null && tableId != null) {
    cy.visit(
      `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaName)}/table/${tableId}`,
    );
    return;
  }

  if (databaseId != null && schemaName != null) {
    cy.visit(
      `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaName)}`,
    );
    return;
  }

  if (databaseId != null) {
    cy.visit(`/admin/datamodel/database/${databaseId}`);
    return;
  }

  cy.visit("/admin/datamodel");
}

function getTablePickerTable(name: string) {
  return cy.findAllByTestId("tree-item").filter(`:contains("${name}")`);
}

function getTableSectionField(name: string) {
  return cy.findByTestId("table-section").get(`a[aria-label="${name}"]`);
}

function clickTableSectionField(name: string) {
  // clicks the icon specifically to avoid issues with clicking the name or description inputs
  return getTableSectionField(name).findByRole("img").scrollIntoView().click();
}

export const DataModel = {
  visit,
  TablePicker: {
    getTable: getTablePickerTable,
  },
  TableSection: {
    getField: getTableSectionField,
    clickField: clickTableSectionField,
  },
};

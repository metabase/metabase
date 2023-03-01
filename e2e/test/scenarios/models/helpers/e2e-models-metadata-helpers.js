import { popover } from "e2e/support/helpers";

export function openColumnOptions(column) {
  cy.findByText(column).click();
}

export function renameColumn(oldName, newName) {
  cy.findByDisplayValue(oldName).clear().type(newName);
}

export function setColumnType(oldType, newType) {
  cy.findByText(oldType).click();
  cy.get(".ReactVirtualized__Grid.MB-Select").scrollTo("top");
  cy.findByPlaceholderText("Search for a special type").type(newType);
  cy.findByText(newType).click();
}

export function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .findByTestId("select-button")
    .click({ force: true });

  popover().contains(table).click();

  popover().contains(column).click();
}

export function setModelMetadata(modelId, callback) {
  return cy.request("GET", `/api/card/${modelId}`).then(response => {
    const { result_metadata } = response.body;
    return cy.request("PUT", `/api/card/${modelId}`, {
      result_metadata: result_metadata.map(callback),
    });
  });
}

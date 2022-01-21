import { popover } from "__support__/e2e/cypress";

export function openColumnOptions(column) {
  cy.findByText(column).click();
}

export function renameColumn(oldName, newName) {
  cy.findByDisplayValue(oldName)
    .clear()
    .type(newName);
}

export function setColumnType(oldType, newType) {
  cy.findByText(oldType).click();
  cy.get(".ReactVirtualized__Grid.MB-Select").scrollTo("top");
  cy.findByPlaceholderText("Search for a special type").type(newType);

  cy.findByText(newType).click();
  cy.button("Save changes").click();
}

export function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .find(".AdminSelect")
    .click();

  popover()
    .contains(table)
    .click();

  popover()
    .contains(column)
    .click();
}

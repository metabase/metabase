import { popover } from "__support__/e2e/cypress";

export function assertCanAddItemsToCollection() {
  cy.findByTestId("collection-menu").within(() => {
    cy.icon("add");
  });
}

/**
 * Clicks the "+" icon on the collection page and selects one of the menu options
 * @param {"question" | "dashboard" | "collection"} type
 */
export function openNewCollectionItemFlowFor(type) {
  cy.findByTestId("collection-menu").within(() => {
    cy.icon("add").click();
  });
  popover()
    .findByText(new RegExp(type, "i"))
    .click();
}

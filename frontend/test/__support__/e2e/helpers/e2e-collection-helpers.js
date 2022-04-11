import { popover } from "__support__/e2e/cypress";

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

export function getSidebarSectionTitle(name) {
  return cy.findAllByRole("heading", { name });
}
